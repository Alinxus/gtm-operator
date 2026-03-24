import type {
  Approval,
  ApprovalDecision,
  Asset,
  Campaign,
  CampaignBundle,
  Claim,
  Critique,
  MarketingStore,
  MemoryProvider,
  MarketResearch,
  Outcome,
  Run,
  PositioningPlan,
  TruthPack,
} from "./domain.js";
import { approvalStageForAsset, assetStatusFromApproval, assetStatusFromCritique, defaultChannelsForCampaignType, runStatusAfterApproval } from "./state-machine.js";
import { createId, isoNow } from "./domain.js";
import { buildCritique } from "./scoring.js";
import {
  channelGenerationWorker,
  groundTruthWorker,
  learningWorker,
  marketResearchWorker,
  positioningWorker,
} from "./workers.js";
import { seedDefaultBrand } from "./seed.js";
import { retainedbTruthPack } from "./seed/retaindb-truth-pack.js";
import { approvalRequiresOverrideReason, approvalRequiresReason } from "./state-machine.js";
import { GtmOperator } from "./gtm-operator.js";

export class MarketingOrchestrator {
  constructor(
    private readonly options: {
      store: MarketingStore;
      memoryProvider: MemoryProvider;
      defaultMemoryProject?: string;
    },
  ) {}

  async seed(force = false) {
    const seeded = await seedDefaultBrand({
      store: this.options.store,
      memoryProvider: this.options.memoryProvider,
      force,
    });

    const operator = new GtmOperator({
      store: this.options.store,
      memoryProvider: this.options.memoryProvider,
    });
    await operator.ensureDefaultWorkspace(seeded.brand);

    return seeded;
  }

  async createCampaign(input: Omit<Campaign, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    return this.options.store.createCampaign({
      ...input,
      id: input.id ?? createId("campaign"),
    });
  }

  async startCampaignRun(campaignId: string) {
    const campaign = await this.requireCampaign(campaignId);
    const brand = await this.requireBrand(campaign.brandId);
    const claims = await this.options.store.listClaimsByBrand(brand.id);
    const effectiveChannels = campaign.channels.length > 0 ? campaign.channels : defaultChannelsForCampaignType(campaign.campaignType);
    const generationCampaign: Campaign = {
      ...campaign,
      channels: effectiveChannels,
    };

    const run = await this.options.store.createRun({
      id: createId("run"),
      brandId: brand.id,
      campaignId: campaign.id,
      status: "grounding",
      approvalStage: null,
      currentStep: "grounding",
      summary: {},
      metadata: {},
      startedAt: isoNow(),
      finishedAt: null,
      error: null,
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.started",
      stage: "grounding",
      payload: { campaignId: campaign.id },
    });

    const truth = groundTruthWorker({
      brand,
      campaign: generationCampaign,
      claims,
      truthPack: brand.slug === retainedbTruthPack.brandSlug ? retainedbTruthPack : undefined,
    });

    await this.options.store.updateRun(run.id, {
      status: "researching",
      currentStep: "researching",
      metadata: {
        truth,
      },
      summary: {
        campaignName: campaign.name,
        channelCount: campaign.channels.length,
        approvedClaimCount: truth.approvedClaims.length,
        blockedClaimCount: truth.blockedClaims.length,
      },
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.grounded",
      stage: "grounding",
      payload: {
        approvedClaimIds: truth.approvedClaims.map((claim) => claim.id),
        blockedClaimIds: truth.blockedClaims.map((claim) => claim.id),
      },
    });

    const research = await marketResearchWorker({
      brand,
      campaign: generationCampaign,
      approvedClaims: truth.approvedClaims,
      memoryProvider: this.options.memoryProvider,
    });

    await this.options.store.updateRun(run.id, {
      status: "positioning",
      currentStep: "positioning",
      metadata: {
        truth,
        research,
      },
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.researched",
      stage: "researching",
      payload: {
        personas: research.personas.map((persona) => persona.persona),
        opportunities: research.opportunities,
      },
    });

    const positioning = positioningWorker({
      brand,
      campaign: generationCampaign,
      truth,
      research,
    });

    await this.options.store.updateRun(run.id, {
      status: "drafting",
      currentStep: "drafting",
      metadata: {
        truth,
        research,
        positioning,
      },
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.positioned",
      stage: "positioning",
      payload: {
        corePromise: positioning.messageHouse.corePromise,
        hooks: positioning.messageHouse.hookBank,
      },
    });

    const drafts = channelGenerationWorker({
      brand,
      campaign: generationCampaign,
      truth,
      research,
      positioning,
    });

    const assets: Asset[] = [];
    for (const draft of drafts) {
      const asset = await this.options.store.createAsset({
        id: createId("asset"),
        brandId: brand.id,
        campaignId: campaign.id,
        runId: run.id,
        channel: draft.channel,
        persona: draft.persona,
        title: draft.title,
        body: draft.body,
        claimIds: draft.claimIds,
        status: "draft",
        approvalStage: draft.approvalStage,
        metadata: draft.metadata,
      });

      const critique = buildCritique({
        brand,
        asset,
        claims: truth.approvedClaims,
        peerAssets: assets,
      });

      await this.options.store.createCritique(critique);

      const updatedAsset = await this.options.store.updateAsset(asset.id, {
        status: assetStatusFromCritique(critique),
        metadata: {
          ...asset.metadata,
          critiqueId: critique.id,
          critiqueScore: critique.score,
          blockingIssues: critique.blockingIssues,
          warnings: critique.warnings,
        },
      });

      assets.push(updatedAsset ?? asset);

      await this.options.store.appendEvent({
        brandId: brand.id,
        runId: run.id,
        eventType: "asset.critiqued",
        stage: draft.approvalStage,
        payload: {
          assetId: asset.id,
          score: critique.score,
          blockingIssues: critique.blockingIssues,
          warnings: critique.warnings,
        },
      });
    }

    await this.options.store.updateCampaign(campaign.id, {
      status: "waiting_for_approval",
    });

    await this.options.store.updateRun(run.id, {
      status: "awaiting_human_review",
      approvalStage: "WAITING_FOR_ASSET_APPROVAL",
      currentStep: "awaiting_human_review",
      metadata: {
        truth,
        research,
        positioning,
      },
      summary: {
        campaignName: campaign.name,
        channelCount: generationCampaign.channels.length,
        approvedClaimCount: truth.approvedClaims.length,
        blockedClaimCount: truth.blockedClaims.length,
        assetCount: assets.length,
        blockingAssetCount: assets.filter((asset) => asset.status === "needs_revision").length,
      },
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.awaiting_human_review",
      stage: "approval",
      payload: {
        assetCount: assets.length,
        blockingAssetCount: assets.filter((asset) => asset.status === "needs_revision").length,
      },
    });

    return this.buildBundle(run.id);
  }

  async approveAsset(input: {
    assetId: string;
    reviewer: string;
    reason?: string;
    decision: ApprovalDecision;
    overrideReason?: string;
  }) {
    return this.recordApproval(input);
  }

  async rejectAsset(input: {
    assetId: string;
    reviewer: string;
    reason?: string;
  }) {
    return this.recordApproval({ ...input, decision: "reject" });
  }

  async overrideAsset(input: {
    assetId: string;
    reviewer: string;
    reason?: string;
    overrideReason?: string;
  }) {
    return this.recordApproval({ ...input, decision: "override" });
  }

  async reviseAsset(input: {
    assetId: string;
    reviewer: string;
    reason?: string;
  }) {
    return this.recordApproval({ ...input, decision: "revise" });
  }

  async recordOutcome(input: {
    runId: string;
    assetId?: string;
    channel?: Asset["channel"];
    metrics: Outcome["metrics"];
    feedback?: string;
  }) {
    const run = await this.requireRun(input.runId);
    const campaign = await this.requireCampaign(run.campaignId);
    const brand = await this.requireBrand(run.brandId);
    const outcome = await this.options.store.createOutcome({
      id: createId("outcome"),
      brandId: brand.id,
      campaignId: campaign.id,
      runId: run.id,
      assetId: input.assetId ?? null,
      channel: input.channel ?? null,
      metrics: input.metrics,
      feedback: input.feedback ?? null,
    });

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "outcome.recorded",
      stage: "learning",
      payload: {
        outcomeId: outcome.id,
        metrics: input.metrics,
      },
    });

    const memoryWrites = learningWorker({
      brand,
      campaign,
      run,
      research: this.requireResearch(run),
      positioning: this.requirePositioning(run),
      assets: await this.options.store.listAssetsByRun(run.id),
      approvals: await this.options.store.listApprovalsByRun(run.id),
      outcomes: await this.options.store.listOutcomesByRun(run.id),
    });

    for (const write of memoryWrites.filter((memoryWrite) => memoryWrite.scope === "performance")) {
      await this.options.memoryProvider.add({
        project: brand.memoryProject,
        ...write,
      });
    }

    return outcome;
  }

  async resumeRun(runId: string) {
    return this.finalizeIfReady(runId);
  }

  async getRunBundle(runId: string) {
    return this.buildBundle(runId);
  }

  async listClaims(brandId: string) {
    return this.options.store.listClaimsByBrand(brandId);
  }

  private async recordApproval(input: {
    assetId: string;
    reviewer: string;
    reason?: string;
    decision: ApprovalDecision;
    overrideReason?: string;
  }) {
    const asset = await this.requireAsset(input.assetId);
    const critique = await this.options.store.findCritiqueByAsset(asset.id);
    if (!critique) {
      throw new Error(`No critique found for asset ${asset.id}`);
    }

    if (critique.blockingIssues.length > 0 && input.decision === "approve") {
      throw new Error("Blocking critic rejection requires override or revise.");
    }

    if (approvalRequiresReason(input.decision) && !String(input.reason ?? "").trim()) {
      throw new Error(`Decision ${input.decision} requires a reason.`);
    }

    if (approvalRequiresOverrideReason(input.decision) && !String(input.overrideReason ?? "").trim()) {
      throw new Error("Override requires an explicit overrideReason.");
    }

    const approval = await this.options.store.createApproval({
      id: createId("approval"),
      brandId: asset.brandId,
      campaignId: asset.campaignId,
      runId: asset.runId,
      assetId: asset.id,
      stage: asset.approvalStage,
      decision: input.decision,
      reason:
        String(input.reason ?? "").trim().length > 0
          ? String(input.reason).trim()
          : input.decision === "approve"
            ? "approved"
            : input.decision === "override"
              ? "approved with exceptions"
              : "sent back for revision",
      overrideReason: input.overrideReason ?? null,
      reviewer: input.reviewer,
    });

    await this.options.store.updateAsset(asset.id, {
      status: assetStatusFromApproval(input.decision, critique),
      metadata: {
        ...asset.metadata,
        approvedBy: input.reviewer,
        approvalDecision: input.decision,
        approvalReason: approval.reason,
        overrideReason: approval.overrideReason,
      },
    });

    await this.options.store.appendEvent({
      brandId: asset.brandId,
      runId: asset.runId,
      eventType: "asset.approved",
      stage: asset.approvalStage,
      payload: {
        assetId: asset.id,
        decision: input.decision,
        reviewer: input.reviewer,
      },
    });

    return this.finalizeIfReady(asset.runId);
  }

  private async finalizeIfReady(runId: string) {
    const run = await this.requireRun(runId);
    const assets = await this.options.store.listAssetsByRun(run.id);
    const approvals = await this.options.store.listApprovalsByRun(run.id);
    const campaign = await this.requireCampaign(run.campaignId);
    const brand = await this.requireBrand(run.brandId);
    const nextStatus = runStatusAfterApproval(assets);

    if (nextStatus === "revision_required") {
      await this.options.store.updateRun(run.id, {
        status: nextStatus,
        currentStep: "revision_required",
        approvalStage: "WAITING_FOR_ASSET_APPROVAL",
      });

      await this.options.store.updateCampaign(campaign.id, {
        status: "blocked",
      });

      return this.buildBundle(run.id);
    }

    if (nextStatus !== "completed") {
      await this.options.store.updateRun(run.id, {
        status: "awaiting_human_review",
        currentStep: "awaiting_human_review",
      });

      return this.buildBundle(run.id);
    }

    const finalizedRun = await this.options.store.updateRun(run.id, {
      status: "completed",
      currentStep: "completed",
      finishedAt: isoNow(),
    });

    await this.options.store.updateCampaign(campaign.id, {
      status: "completed",
    });

    const bundle = await this.buildBundle(run.id);
    const memoryWrites = learningWorker({
      brand,
      campaign,
      run: finalizedRun ?? run,
      research: this.requireResearch(run),
      positioning: this.requirePositioning(run),
      assets,
      approvals,
      outcomes: await this.options.store.listOutcomesByRun(run.id),
    });

    for (const write of memoryWrites) {
      await this.options.memoryProvider.add({
        project: brand.memoryProject,
        ...write,
      });
    }

    await this.options.store.appendEvent({
      brandId: brand.id,
      runId: run.id,
      eventType: "run.completed",
      stage: "learning",
      payload: {
        approvals: approvals.length,
        assets: assets.length,
      },
    });

    return this.buildBundle(run.id);
  }

  private async buildBundle(runId: string): Promise<CampaignBundle> {
    const run = await this.requireRun(runId);
    const campaign = await this.requireCampaign(run.campaignId);
    const brand = await this.requireBrand(run.brandId);
    const assets = await this.options.store.listAssetsByRun(run.id);
    const critiques = await this.options.store.listCritiquesByRun(run.id);
    const approvals = await this.options.store.listApprovalsByRun(run.id);
    const truth = this.requireTruth(run);
    const research = this.requireResearch(run);
    const positioning = this.requirePositioning(run);

    const critiquedAssets = assets.map((asset) => ({
      ...asset,
      critique: critiques.find((critique) => critique.assetId === asset.id) ?? null,
      approval: approvals.find((approval) => approval.assetId === asset.id) ?? null,
    }));

    return {
      run,
      brand,
      campaign,
      truthPack: truth,
      research,
      positioning,
      assets: critiquedAssets,
      approvals,
      critiques,
      nextActions: this.nextActionsForRun(run, assets),
      memoryWrites: learningWorker({
        brand,
        campaign,
        run,
        research,
        positioning,
        assets,
        approvals,
        outcomes: await this.options.store.listOutcomesByRun(run.id),
      }),
    };
  }

  private nextActionsForRun(run: Run, assets: Asset[]) {
    if (run.status === "completed") {
      return [
        "Record post-launch outcome metrics.",
        "Capture which hooks and claims actually performed.",
        "Reuse the approved voice and objections for the next campaign.",
      ];
    }

    if (run.status === "revision_required") {
      return [
        "Revise the blocked assets.",
        "Re-run the critic after fixing unsupported claims or weak CTAs.",
        "Re-submit the campaign for approval.",
      ];
    }

    const blockingAssets = assets.filter((asset) => asset.status === "needs_revision");
    if (blockingAssets.length > 0) {
      return [
        "Review the critic findings on the blocked assets.",
        "Choose override with reason or revise and resubmit.",
        "Keep the approved assets as-is and only change the blocked ones.",
      ];
    }

    return [
      "Review the generated assets.",
      "Approve or override any critic block with a reason.",
      "Record outcomes after distribution.",
    ];
  }

  private requireTruth(run: Run) {
    const truth = run.metadata.truth as
      | {
          approvedClaims: Claim[];
          blockedClaims: Claim[];
          forbiddenClaims: string[];
          proofPoints: string[];
        }
      | undefined;

    if (truth) return truth;

    return {
      approvedClaims: [],
      blockedClaims: [],
      forbiddenClaims: [],
      proofPoints: [],
    };
  }

  private requireResearch(run: Run): MarketResearch {
    const research = run.metadata.research as MarketResearch | undefined;
    if (research) return research;
    throw new Error(`Run ${run.id} is missing research metadata.`);
  }

  private requirePositioning(run: Run): PositioningPlan {
    const positioning = run.metadata.positioning as PositioningPlan | undefined;
    if (positioning) return positioning;
    throw new Error(`Run ${run.id} is missing positioning metadata.`);
  }

  private async requireBrand(brandId: string) {
    const brand = await this.options.store.findBrandById(brandId);
    if (!brand) throw new Error(`Brand not found: ${brandId}`);
    return brand;
  }

  private async requireCampaign(campaignId: string) {
    const campaign = await this.options.store.findCampaignById(campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    return campaign;
  }

  private async requireRun(runId: string) {
    const run = await this.options.store.findRunById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }

  private async requireAsset(assetId: string) {
    const asset = await this.options.store.findAssetById(assetId);
    if (!asset) throw new Error(`Asset not found: ${assetId}`);
    return asset;
  }
}
