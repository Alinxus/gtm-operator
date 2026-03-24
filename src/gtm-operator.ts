import type {
  ApprovalDecision,
  Asset,
  Attribution,
  Brand,
  Campaign,
  ChannelType,
  Claim,
  Conversation,
  Goal,
  GoalMetric,
  ICPProfile,
  MarketingStore,
  MemoryProvider,
  Opportunity,
  OpportunityStage,
  PlaybookType,
  ProspectAccount,
  ProspectPerson,
  Sequence,
  Signal,
  SignalSource,
  Touch,
  TouchType,
  GrowthLane,
  Workspace,
  WorkspaceDashboard,
} from "./domain.js";
import { createId, dedupe, isoNow } from "./domain.js";
import { buildCritique } from "./scoring.js";
import { approvalStageForAsset, assetStatusFromApproval, assetStatusFromCritique, runStatusAfterApproval } from "./state-machine.js";
import { scopeToMemoryType } from "./memory.js";
import type { LanguageModelProvider } from "./llm.js";
import type { ExternalResearchDocument } from "./research-connectors.js";
import { runIcpScoringWorker, runOperatorResearchWorker, runOperatorSequenceWorker } from "./operator-workers.js";
import { analyzeRetainDbFit, type RetainDbFitAnalysis } from "./retaindb-intelligence.js";

const PAIN_TERMS = ["memory", "context", "forget", "hallucination", "docs", "agent", "personalization", "preferences"];
const BUYING_TERMS = ["looking", "need", "vendor", "pricing", "demo", "pilot", "buy", "recommend", "integrate", "integration"];
const PROOF_TERMS = ["benchmark", "latency", "accuracy", "hallucination", "eval", "proof", "sota"];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalize(text: string) {
  return text.toLowerCase();
}

function countMatches(text: string, terms: string[]) {
  const lower = normalize(text);
  return terms.filter((term) => lower.includes(term)).length;
}

function keywordScore(text: string, terms: string[], max: number) {
  return Math.min(1, countMatches(text, terms) / Math.max(1, max));
}

function sourceFreshness(source: SignalSource) {
  switch (source) {
    case "x":
    case "linkedin":
    case "reddit":
    case "hacker_news":
      return 0.95;
    case "y_combinator":
      return 0.82;
    case "docs":
    case "product":
    case "form":
      return 1;
    case "github":
      return 0.8;
    case "crm":
    case "manual":
    default:
      return 0.7;
  }
}

function founderScore(role?: string | null) {
  const lower = normalize(role ?? "");
  if (lower.includes("founder") || lower.includes("ceo") || lower.includes("co-founder")) return 1;
  if (lower.includes("cto")) return 0.9;
  if (lower.includes("head") || lower.includes("lead")) return 0.75;
  if (lower.includes("engineer") || lower.includes("builder")) return 0.65;
  return 0.45;
}

function inferPersonaFit(content: string, accountName: string, icp: string, role?: string | null) {
  const text = `${content} ${accountName} ${icp} ${role ?? ""}`;
  return Math.min(1, keywordScore(text, ["ai", "agent", "llm", "copilot", "memory", "workflow", "founder"], 4));
}

function choosePlaybook(input: {
  source: SignalSource;
  content: string;
  buyingSignal: number;
  proofMatch: number;
  fitAnalysis: RetainDbFitAnalysis;
}) {
  const lower = normalize(input.content);
  if (input.source === "form" || input.source === "docs" || input.source === "product" || input.buyingSignal > 0.8) {
    return "follow_up_after_interest" as PlaybookType;
  }
  if (
    input.fitAnalysis.primaryPainId === "agent_workflow_memory" ||
    input.fitAnalysis.primaryPainId === "coding_context_grounding" ||
    lower.includes("integration") ||
    lower.includes("partner")
  ) {
    return "integration_outreach" as PlaybookType;
  }
  if (lower.includes("integration") || lower.includes("partner") || input.source === "github") {
    return "integration_outreach" as PlaybookType;
  }
  if (input.fitAnalysis.proofReadinessScore >= 55 || input.proofMatch > 0.55 || lower.includes("benchmark") || lower.includes("latency")) {
    return "benchmark_proof_push" as PlaybookType;
  }
  if (input.source === "reddit" || input.source === "hacker_news") {
    return "community_participation" as PlaybookType;
  }
  if (input.source === "x" || input.source === "linkedin") {
    return "founder_reply_assist" as PlaybookType;
  }
  if (input.source === "y_combinator") {
    return "founder_outbound" as PlaybookType;
  }
  return "founder_outbound" as PlaybookType;
}

function chooseChannels(input: { source: SignalSource; person?: ProspectPerson | null; playbook: PlaybookType }) {
  const channels = new Set<ChannelType>();
  if (input.person?.email) channels.add("outbound");
  if (input.person?.socialHandle || input.source === "x" || input.source === "linkedin") {
    channels.add("reply");
    channels.add("social");
  }
  if (input.source === "reddit" || input.source === "hacker_news") channels.add("community");
  if (input.source === "y_combinator") {
    channels.add("outbound");
    channels.add("landing");
  }
  if (input.playbook === "integration_outreach") channels.add("partnership");
  channels.add("landing");
  return [...channels];
}

function reasonFromScores(input: {
  accountName: string;
  painMatch: number;
  buyingSignal: number;
  founderImportance: number;
  proofMatch: number;
  fitAnalysis: RetainDbFitAnalysis;
}) {
  const reasons = [
    input.fitAnalysis.primaryPainLabel ? `${input.fitAnalysis.primaryPainLabel.toLowerCase()} is visible` : input.buyingSignal > 0.7 ? "high buying signal" : "real pain signal",
    input.fitAnalysis.qualificationScore >= 65 ? "strong first-customer fit" : input.painMatch > 0.5 ? "clear memory/context pain" : "technical fit",
    input.founderImportance > 0.8 ? "founder-level contact" : "reachable buyer",
    input.fitAnalysis.proofReadinessScore >= 45 || input.proofMatch > 0.5 ? "clean proof path available" : "strong product fit",
  ];
  return `${input.accountName}: ${reasons.join(", ")}.`;
}

function nextActionForPlaybook(playbook: PlaybookType) {
  switch (playbook) {
    case "founder_reply_assist":
      return "Draft a public reply, then follow with a short founder note.";
    case "benchmark_proof_push":
      return "Lead with measured proof and route to a call or proof pack.";
    case "integration_outreach":
      return "Send an integration-focused note and a partner-ready proof path.";
    case "community_participation":
      return "Join the thread with a grounded answer, then follow up directly.";
    case "follow_up_after_interest":
      return "Respond fast with a tailored proof pack and book a conversation.";
    case "launch_amplification":
      return "Push the launch across social, community, and a landing variant.";
    case "founder_outbound":
    default:
      return "Send a founder-style outbound note with the strongest proof angle.";
  }
}

function pipelineFromOpportunities(opportunities: Opportunity[]) {
  return {
    signal: opportunities.filter((item) => item.stage === "signal").length,
    touched: opportunities.filter((item) => item.stage === "touched").length,
    replied: opportunities.filter((item) => item.stage === "replied").length,
    booked: opportunities.filter((item) => item.stage === "booked").length,
    qualified: opportunities.filter((item) => item.stage === "qualified").length,
    paid: opportunities.filter((item) => item.stage === "paid").length,
    closed_lost: opportunities.filter((item) => item.stage === "closed_lost").length,
  } satisfies Record<OpportunityStage, number>;
}

function claimIdsForPlaybook(playbook: PlaybookType, claims: Claim[]) {
  const preferred: Record<PlaybookType, string[]> = {
    founder_outbound: ["retainedb-persistent-memory", "retainedb-grounded-docs", "retainedb-three-calls", "retainedb-zero-rearchitecting", "retainedb-any-llm"],
    founder_reply_assist: ["retainedb-persistent-memory", "retainedb-grounded-docs", "retainedb-three-calls", "retainedb-any-llm"],
    benchmark_proof_push: ["retainedb-preference-recall-88", "retainedb-overall-accuracy-79", "retainedb-grounded-docs-zero-hallucination", "retainedb-sub40-p95"],
    integration_outreach: ["retainedb-zero-rearchitecting", "retainedb-any-llm", "retainedb-canonical-memory-api", "retainedb-canonical-mcp-surface"],
    community_participation: ["retainedb-persistent-memory", "retainedb-grounded-docs", "retainedb-memory-model", "retainedb-canonical-memory-api"],
    launch_amplification: ["retainedb-persistent-memory", "retainedb-three-calls", "retainedb-preference-recall-88", "retainedb-zero-rearchitecting"],
    follow_up_after_interest: ["retainedb-persistent-memory", "retainedb-grounded-docs", "retainedb-zero-rearchitecting", "retainedb-any-llm"],
  };
  const byId = new Map(claims.map((claim) => [claim.id, claim] as const));
  return preferred[playbook].map((id) => byId.get(id)).filter((claim): claim is Claim => Boolean(claim));
}

function claimIdsForOpportunity(playbook: PlaybookType, claims: Claim[], fitAnalysis: RetainDbFitAnalysis | null) {
  const playbookClaims = claimIdsForPlaybook(playbook, claims);
  if (!fitAnalysis) return playbookClaims;

  const byId = new Map(claims.map((claim) => [claim.id, claim] as const));
  return dedupe([
    ...fitAnalysis.matchedProofClaimIds,
    ...fitAnalysis.matchedCapabilityClaimIds,
    ...playbookClaims.map((claim) => claim.id),
  ])
    .map((id) => byId.get(id))
    .filter((claim): claim is Claim => Boolean(claim));
}

function fitAnalysisFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.fitAnalysis;
  return value && typeof value === "object" ? (value as RetainDbFitAnalysis) : null;
}

function touchTypeForChannel(channel: ChannelType): TouchType {
  switch (channel) {
    case "outbound":
      return "email";
    case "reply":
      return "public_reply";
    case "social":
      return "post";
    case "community":
      return "community_post";
    case "landing":
    case "seo":
      return "landing_variant";
    case "partnership":
      return "dm";
  }
}

function asResearchDocuments(value: unknown): ExternalResearchDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").map((item) => item as ExternalResearchDocument);
}

export class GtmOperator {
  constructor(
    protected readonly options: {
      store: MarketingStore;
      memoryProvider: MemoryProvider;
      llmProvider?: LanguageModelProvider;
    },
  ) {}

  async ensureDefaultWorkspace(brand: Brand) {
    const existing = await this.options.store.findWorkspaceBySlug(brand.id, `${brand.slug}-gtm`);
    if (existing) return existing;

    const workspace = await this.options.store.createWorkspace({
      id: createId("workspace"),
      brandId: brand.id,
      slug: `${brand.slug}-gtm`,
      name: `${brand.name} GTM`,
      description: "Signals in. Best next action out.",
      primaryIcp: "AI app founders and small technical teams shipping AI features now.",
      metadata: { seeded: true },
    });

    await this.options.store.createICPProfile({
      id: createId("icp"),
      workspaceId: workspace.id,
      brandId: brand.id,
      name: "AI app founders",
      description: "Founders and small teams shipping AI products that need memory, grounded docs, and repeatable context.",
      pains: ["context loss", "memory gaps", "hallucinated answers", "rebuild pressure"],
      triggers: ["looking for memory", "complaining about context", "evaluating agent infra", "integration pain"],
      disqualifiers: ["non-AI teams", "paid ads only", "purely consumer social growth"],
      channels: ["outbound", "reply", "social", "community", "landing"],
      metadata: { seeded: true },
    });

    await this.options.store.createGoal({
      id: createId("goal"),
      workspaceId: workspace.id,
      brandId: brand.id,
      name: "First 10 booked conversations",
      targetMetric: "booked_conversations",
      targetValue: 10,
      currentValue: 0,
      windowStart: isoNow(),
      windowEnd: null,
      metadata: { seeded: true },
    });

    await this.options.store.createGoal({
      id: createId("goal"),
      workspaceId: workspace.id,
      brandId: brand.id,
      name: "First 10 paid users",
      targetMetric: "paid_users",
      targetValue: 10,
      currentValue: 0,
      windowStart: isoNow(),
      windowEnd: null,
      metadata: { seeded: true },
    });

    return workspace;
  }

  async listWorkspaces(brandId?: string) {
    if (brandId) return this.options.store.listWorkspacesByBrand(brandId);
    const brands = await this.options.store.listBrands();
    const workspaces = await Promise.all(brands.map((brand) => this.options.store.listWorkspacesByBrand(brand.id)));
    return workspaces.flat();
  }

  async getWorkspaceDashboard(workspaceId: string): Promise<WorkspaceDashboard> {
    const workspace = await this.requireWorkspace(workspaceId);
    const [goals, opportunities, accounts, touches, conversations, attributions, sequences] = await Promise.all([
      this.options.store.listGoalsByWorkspace(workspaceId),
      this.options.store.listOpportunitiesByWorkspace(workspaceId),
      this.options.store.listProspectAccountsByWorkspace(workspaceId),
      this.options.store.listTouchesByWorkspace(workspaceId),
      this.options.store.listConversationsByWorkspace(workspaceId),
      this.options.store.listAttributionsByWorkspace(workspaceId),
      this.options.store.listSequencesByWorkspace(workspaceId),
    ]);

    const pendingTouches = touches.filter((touch) => touch.status === "review_required" || touch.status === "needs_revision");
    const approvals = [];
    for (const touch of pendingTouches) {
      const asset = await this.options.store.findAssetById(touch.assetId);
      if (!asset) continue;
      const critique = await this.options.store.findCritiqueByAsset(asset.id);
      const sequence = sequences.find((item) => item.id === touch.sequenceId) ?? null;
      const account = sequence ? accounts.find((item) => item.id === sequence.accountId) ?? null : null;
      const person = sequence?.personId ? (await this.options.store.findProspectPersonById(sequence.personId)) ?? null : null;
      approvals.push({ touch, asset, critique, sequence, account, person });
    }

    const rankedOpportunities = [...opportunities].sort((a, b) => b.score - a.score);
    return {
      workspace,
      goals,
      today: rankedOpportunities.slice(0, 10),
      accounts: [...accounts].sort((a, b) => b.fitScore - a.fitScore).slice(0, 25),
      approvals,
      pipeline: pipelineFromOpportunities(opportunities),
      outcomes: {
        conversations,
        attributions,
        bookedCount: conversations.filter((item) => item.status === "booked" || item.status === "qualified" || item.status === "paid").length,
        paidCount: conversations.filter((item) => item.status === "paid").length,
      },
    };
  }

  async ingestSignal(input: {
    workspaceId: string;
    source: SignalSource;
    title: string;
    content: string;
    evidenceUrls?: string[];
    account?: { id?: string; name: string; domain?: string | null; summary?: string };
    person?: { id?: string; name: string; role: string; email?: string | null; socialHandle?: string | null };
    autoGenerateSequence?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const icpProfiles = await this.options.store.listICPProfilesByWorkspace(workspace.id);
    const icp = icpProfiles[0]?.description ?? workspace.primaryIcp;

    const account = await this.ensureAccount(workspace, brand, input.account);
    const person = await this.ensurePerson(workspace, brand, account, input.person);

    const claims = await this.options.store.listClaimsByBrand(brand.id);
    const researchDocuments = asResearchDocuments(input.metadata?.researchDocuments);
    const fitAnalysis = analyzeRetainDbFit({
      title: input.title,
      content: input.content,
      source: input.source,
      accountName: account.name,
      role: person?.role ?? input.person?.role ?? null,
      documents: researchDocuments,
      claims,
    });

    const founderImportance = founderScore(person?.role ?? null);
    const freshness = sourceFreshness(input.source);

    // Run LLM ICP scorer when available; fall back to keyword scoring
    const llm = this.options.llmProvider ?? { enabled: false as const, provider: "disabled" as const, generateText: async () => "", generateObject: async () => ({} as never) };
    const icpScore = await runIcpScoringWorker({
      llm,
      workspace,
      account,
      signal: { title: input.title, content: input.content, source: input.source },
      icp,
      documents: researchDocuments,
    });

    const painMatch = icpScore
      ? icpScore.painMatch
      : Math.max(keywordScore(input.content, PAIN_TERMS, 4), fitAnalysis.painScore / 100);
    const buyingSignal = icpScore
      ? icpScore.buyingSignal
      : Math.max(
          keywordScore(input.content, BUYING_TERMS, 3),
          fitAnalysis.buyingReadinessScore / 100,
          input.source === "form" || input.source === "product" ? 0.95 : input.source === "docs" ? 0.85 : 0,
        );
    const proofMatch = icpScore
      ? icpScore.proofReadiness
      : Math.max(keywordScore(input.content, PROOF_TERMS, 3), fitAnalysis.proofReadinessScore / 100);
    const personaFit = Math.max(inferPersonaFit(input.content, account.name, icp, person?.role ?? null), fitAnalysis.shippingAiScore / 100);
    const qualificationFit = fitAnalysis.qualificationScore / 100;
    const score = icpScore
      ? icpScore.score
      : clampScore(
          personaFit * 16 +
            painMatch * 18 +
            buyingSignal * 18 +
            founderImportance * 10 +
            proofMatch * 12 +
            freshness * 8 +
            qualificationFit * 18,
        );
    const recommendedPlaybook = choosePlaybook({
      source: input.source,
      content: input.content,
      buyingSignal,
      proofMatch,
      fitAnalysis,
    });
    const reachableChannels = chooseChannels({ source: input.source, person, playbook: recommendedPlaybook });
    const accountFitScore = clampScore(
      Math.max(
        account.fitScore,
        fitAnalysis.qualificationScore * 0.6 + fitAnalysis.proofReadinessScore * 0.2 + fitAnalysis.shippingAiScore * 0.2,
      ),
    );
    const accountSummary =
      input.account?.summary ??
      `${account.name} looks like a fit for ${fitAnalysis.primaryPainLabel?.toLowerCase() ?? "memory and grounding pain"} with ${fitAnalysis.outcomeAngles[0] ?? "a stronger product outcome"} as the main angle.`;
    const fitPainKeywords = dedupe(
      [
        fitAnalysis.primaryPainLabel ?? "",
        ...fitAnalysis.painIds.map((painId) => painId.replace(/_/g, " ")),
        ...fitAnalysis.outcomeAngles,
      ].filter(Boolean),
    );

    await this.options.store.updateProspectAccount(account.id, {
      fitScore: accountFitScore,
      channels: dedupe([...account.channels, ...reachableChannels]),
      summary: accountSummary,
      metadata: {
        ...account.metadata,
        fitAnalysis,
        strongestPain: fitAnalysis.primaryPainId,
        matchedClaimIds: fitAnalysis.matchedClaimIds,
        objections: fitAnalysis.objections,
        strengths: fitAnalysis.strengths,
        weaknesses: fitAnalysis.weaknesses,
        lastSignalSource: input.source,
      },
    });
    if (person) {
      await this.options.store.updateProspectPerson(person.id, {
        personaFit: Math.max(person.personaFit, personaFit),
        metadata: {
          ...person.metadata,
          strongestPain: fitAnalysis.primaryPainId,
          proofReadinessScore: fitAnalysis.proofReadinessScore,
          buyingReadinessScore: fitAnalysis.buyingReadinessScore,
        },
      });
    }

    const signal = await this.options.store.createSignal({
      id: createId("signal"),
      workspaceId: workspace.id,
      brandId: brand.id,
      accountId: account.id,
      personId: person?.id ?? null,
      lane: "outbound",
      sourceLane: "outbound",
      campaignBurstId: null,
      source: input.source,
      title: input.title,
      content: input.content,
      evidenceUrls: input.evidenceUrls ?? [],
      confidence: clampScore((personaFit + buyingSignal + painMatch + qualificationFit) / 4 * 100) / 100,
      personaFit,
      freshness,
      buyingSignal,
      painMatch,
      proofMatch,
      founderImportance,
      channelHint: reachableChannels[0] ?? "outbound",
      metadata: {
        accountName: account.name,
        personName: person?.name ?? null,
        icp,
        fitAnalysis,
        matchedClaimIds: fitAnalysis.matchedClaimIds,
        painKeywords: fitPainKeywords,
        outcomeAngles: fitAnalysis.outcomeAngles,
        objections: fitAnalysis.objections,
        strengths: fitAnalysis.strengths,
        weaknesses: fitAnalysis.weaknesses,
        qualificationScore: fitAnalysis.qualificationScore,
        ...(icpScore ? {
          icpScore: icpScore.score,
          icpFitTier: icpScore.fitTier,
          icpReasons: icpScore.reasons,
          icpDisqualifiers: icpScore.disqualifiers,
          icpRecommendedAngle: icpScore.recommendedAngle,
        } : {}),
        ...(input.metadata ?? {}),
      },
    });

    const opportunity = await this.options.store.createOpportunity({
      id: createId("opportunity"),
      workspaceId: workspace.id,
      brandId: brand.id,
      accountId: account.id,
      personId: person?.id ?? null,
      signalId: signal.id,
      lane: "outbound",
      sourceLane: "outbound",
      campaignBurstId: null,
      stage: "signal",
      score,
      reason: reasonFromScores({
        accountName: account.name,
        painMatch,
        buyingSignal,
        founderImportance,
        proofMatch,
        fitAnalysis,
      }),
      recommendedPlaybook,
      reachableChannels,
      nextAction: nextActionForPlaybook(recommendedPlaybook),
      metadata: {
        signalSource: input.source,
        fitAnalysis,
        matchedClaimIds: fitAnalysis.matchedClaimIds,
        capabilityClaimIds: fitAnalysis.matchedCapabilityClaimIds,
        proofClaimIds: fitAnalysis.matchedProofClaimIds,
        qualificationScore: fitAnalysis.qualificationScore,
        proofReadinessScore: fitAnalysis.proofReadinessScore,
        outcomeAngles: fitAnalysis.outcomeAngles,
        objections: fitAnalysis.objections,
        strengths: fitAnalysis.strengths,
        weaknesses: fitAnalysis.weaknesses,
        painKeywords: fitPainKeywords,
        keywords: {
          pain: countMatches(input.content, PAIN_TERMS) + fitAnalysis.painIds.length,
          buying: countMatches(input.content, BUYING_TERMS),
          proof: countMatches(input.content, PROOF_TERMS) + fitAnalysis.matchedProofClaimIds.length,
        },
      },
    });

    await this.options.memoryProvider.add({
      project: brand.memoryProject,
      scope: "working",
      memoryType: scopeToMemoryType("working"),
      content: `Signal for ${account.name}: ${input.title}. Primary pain: ${fitAnalysis.primaryPainLabel ?? "unknown"}. ${input.content}`,
      namespace: `account:${account.id}`,
      tags: [brand.slug, workspace.id, account.id, input.source],
      importance: Math.min(1, score / 100),
      metadata: {
        workspaceId: workspace.id,
        signalId: signal.id,
        opportunityId: opportunity.id,
        fitAnalysis,
      },
    });

    const sequence =
      input.autoGenerateSequence === false
        ? null
        : await this.generateSequence(workspace, brand, account, person, signal, opportunity, {
            lane: "outbound",
            sourceLane: "outbound",
          });
    return {
      workspace,
      account,
      person,
      signal,
      opportunity,
      sequence,
    };
  }

  async listApprovals(workspaceId: string) {
    return (await this.getWorkspaceDashboard(workspaceId)).approvals;
  }

  async recordTouchDecision(input: {
    touchId: string;
    reviewer: string;
    decision: ApprovalDecision;
    reason?: string;
    overrideReason?: string;
  }) {
    const touch = await this.requireTouch(input.touchId);
    const asset = await this.requireAsset(touch.assetId);
    const critique = await this.requireCritique(asset.id);

    if (critique.blockingIssues.length > 0 && input.decision === "approve") {
      throw new Error("Blocking critic rejection requires override or revise.");
    }
    if ((input.decision === "reject" || input.decision === "override" || input.decision === "revise") && !String(input.reason ?? "").trim()) {
      throw new Error(`Decision ${input.decision} requires a reason.`);
    }
    if (input.decision === "override" && !String(input.overrideReason ?? "").trim()) {
      throw new Error("Override requires an explicit overrideReason.");
    }

    await this.options.store.createApproval({
      id: createId("approval"),
      brandId: asset.brandId,
      campaignId: asset.campaignId,
      runId: asset.runId,
      assetId: asset.id,
      stage: asset.approvalStage,
      decision: input.decision,
      reason: String(input.reason ?? input.decision).trim(),
      overrideReason: input.overrideReason ?? null,
      reviewer: input.reviewer,
    });

    const nextAssetStatus = assetStatusFromApproval(input.decision, critique);
    const updatedAsset = await this.options.store.updateAsset(asset.id, {
      status: nextAssetStatus,
      metadata: {
        ...asset.metadata,
        approvalDecision: input.decision,
        approvalReason: input.reason ?? null,
        overrideReason: input.overrideReason ?? null,
      },
    });

    const nextTouchStatus =
      nextAssetStatus === "approved"
        ? "approved"
        : nextAssetStatus === "approved_with_exceptions"
          ? "approved_with_exceptions"
          : "needs_revision";

    await this.options.store.updateTouch(touch.id, {
      status: nextTouchStatus,
      metadata: {
        ...touch.metadata,
        approvalDecision: input.decision,
      },
    });

    await this.syncSequenceAndRun(touch.sequenceId);
    return {
      touch: await this.requireTouch(touch.id),
      asset: updatedAsset ?? asset,
    };
  }

  async recordTouchBatchDecision(input: {
    workspaceId: string;
    touchIds: string[];
    reviewer: string;
    decision: ApprovalDecision;
    reason?: string;
    overrideReason?: string;
  }) {
    const approved = [];
    for (const touchId of input.touchIds) {
      const touch = await this.requireTouch(touchId);
      if (touch.workspaceId !== input.workspaceId) continue;
      approved.push(
        await this.recordTouchDecision({
          touchId,
          reviewer: input.reviewer,
          decision: input.decision,
          reason: input.reason,
          overrideReason: input.overrideReason,
        }),
      );
    }
    return approved;
  }

  async markTouchSent(touchId: string) {
    const touch = await this.requireTouch(touchId);
    const updatedTouch = await this.options.store.updateTouch(touchId, {
      status: "sent",
      metadata: {
        ...touch.metadata,
        sentAt: isoNow(),
      },
    });

    const sequence = await this.requireSequence(touch.sequenceId);
    await this.options.store.updateSequence(sequence.id, {
      status: "in_progress",
    });

    if (sequence.opportunityId) {
      const opportunity = await this.requireOpportunity(sequence.opportunityId);
      if (opportunity.stage === "signal") {
        await this.options.store.updateOpportunity(opportunity.id, { stage: "touched" });
        if (opportunity.accountId) {
          await this.options.store.updateProspectAccount(opportunity.accountId, { stage: "touched" });
        }
      }
    }

    return updatedTouch ?? touch;
  }

  async recordConversation(input: {
    workspaceId: string;
    accountId: string;
    personId?: string;
    opportunityId?: string;
    touchId?: string;
    status: Conversation["status"];
    summary: string;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const conversation = await this.options.store.createConversation({
      id: createId("conversation"),
      workspaceId: workspace.id,
      brandId: brand.id,
      accountId: input.accountId,
      personId: input.personId ?? null,
      opportunityId: input.opportunityId ?? null,
      status: input.status,
      summary: input.summary,
      lastInteractionAt: isoNow(),
      metadata: {
        touchId: input.touchId ?? null,
      },
    });

    if (input.opportunityId) {
      await this.options.store.updateOpportunity(input.opportunityId, { stage: this.stageForConversationStatus(input.status) });
    }
    await this.options.store.updateProspectAccount(input.accountId, { stage: this.stageForConversationStatus(input.status) });

    const metrics = this.metricsForConversationStatus(input.status);
    if (metrics.length > 0) {
      const goals = await this.options.store.listGoalsByWorkspace(workspace.id);
      for (const goal of goals.filter((item) => metrics.includes(item.targetMetric))) {
        await this.options.store.updateGoal(goal.id, {
          currentValue: goal.currentValue + 1,
        });
      }
    }

    if (input.opportunityId) {
      await this.options.store.createAttribution({
        id: createId("attribution"),
        workspaceId: workspace.id,
        brandId: brand.id,
        accountId: input.accountId,
        personId: input.personId ?? null,
        opportunityId: input.opportunityId,
        conversationId: conversation.id,
        touchId: input.touchId ?? null,
        outcomeId: null,
        stage: input.status === "paid" ? "paid" : input.status === "booked" ? "booked" : "reply",
        channel: input.touchId ? (await this.requireTouch(input.touchId)).channel : null,
        weight: 1,
        notes: input.summary,
      });
    }

    await this.options.memoryProvider.add({
      project: brand.memoryProject,
      scope: "performance",
      memoryType: scopeToMemoryType("performance"),
      content: `Conversation update for account ${input.accountId}: ${input.status}. ${input.summary}`,
      namespace: `account:${input.accountId}`,
      tags: [brand.slug, workspace.id, input.status],
      importance: input.status === "paid" ? 1 : input.status === "booked" ? 0.9 : 0.7,
      metadata: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        opportunityId: input.opportunityId ?? null,
      },
    });

    return conversation;
  }

  protected async generateSequence(
    workspace: Workspace,
    brand: Brand,
    account: ProspectAccount,
    person: ProspectPerson | null,
    signal: Signal,
    opportunity: Opportunity,
    options?: {
      lane?: GrowthLane;
      sourceLane?: GrowthLane;
      campaignBurstId?: string | null;
      laneRunId?: string | null;
      campaignId?: string | null;
      sequenceTitle?: string | null;
    },
  ) {
    const fitAnalysis = fitAnalysisFromMetadata(opportunity.metadata) ?? fitAnalysisFromMetadata(signal.metadata);
    const claims = claimIdsForOpportunity(
      opportunity.recommendedPlaybook,
      await this.options.store.listClaimsByBrand(brand.id),
      fitAnalysis,
    );
    const memoryQuery = `${account.name} ${fitAnalysis?.primaryPainLabel ?? ""} ${signal.title} ${signal.content} ${(fitAnalysis?.outcomeAngles ?? []).join(" ")}`;
    const [accountMemoryHits, brandMemoryHits] = await Promise.all([
      this.options.memoryProvider
        .search({
          query: memoryQuery,
          project: brand.memoryProject,
          namespace: `account:${account.id}`,
          limit: 5,
        })
        .catch(() => []),
      this.options.memoryProvider
        .search({
          query: `${fitAnalysis?.primaryPainLabel ?? ""} ${(fitAnalysis?.outcomeAngles ?? []).join(" ")} ${signal.title}`,
          project: brand.memoryProject,
          limit: 6,
        })
        .catch(() => []),
    ]);
    const memoryHits = dedupe(
      [...accountMemoryHits, ...brandMemoryHits].map((item) => JSON.stringify({ content: item.content, metadata: item.metadata ?? {} })),
    ).map((item) => JSON.parse(item) as { content: string; metadata?: Record<string, unknown> });
    const researchDocuments = asResearchDocuments(signal.metadata.researchDocuments);
    const researchPack = await runOperatorResearchWorker({
      llm: this.options.llmProvider ?? { enabled: false, provider: "disabled", generateText: async () => "", generateObject: async () => ({} as never) },
      brand,
      workspace,
      account,
      person,
      signal,
      claims,
      memoryHits: memoryHits.map((item) => item.content),
      documents: researchDocuments,
      fitAnalysis:
        fitAnalysis ??
        analyzeRetainDbFit({
          title: signal.title,
          content: signal.content,
          source: signal.source,
          accountName: account.name,
          role: person?.role ?? null,
          documents: researchDocuments,
          claims,
        }),
    }).catch(() => null);
    const normalizedResearchPack = researchPack
      ? {
          accountSummary: researchPack.accountSummary,
          painSignals: researchPack.painSignals ?? [],
          proofHooks: researchPack.proofHooks ?? [],
          objections: researchPack.objections ?? [],
          recommendedChannels: researchPack.recommendedChannels ?? [],
          nextActionReason: researchPack.nextActionReason,
        }
      : null;
    const campaign = options?.campaignId ? await this.options.store.findCampaignById(options.campaignId) ?? (await this.ensureOperatorCampaign(workspace, brand)) : await this.ensureOperatorCampaign(workspace, brand);
    const run = await this.options.store.createRun({
      id: createId("run"),
      brandId: brand.id,
      campaignId: campaign.id,
      status: "drafting",
      approvalStage: "WAITING_FOR_SEND_APPROVAL",
      currentStep: "drafting",
      summary: {
        workspaceId: workspace.id,
        opportunityId: opportunity.id,
      },
      metadata: {
        operator: true,
        lane: options?.lane ?? "outbound",
        sourceLane: options?.sourceLane ?? options?.lane ?? "outbound",
        campaignBurstId: options?.campaignBurstId ?? null,
        laneRunId: options?.laneRunId ?? null,
        generationMode: this.options.llmProvider?.enabled ? "model-assisted" : "deterministic",
        workspaceId: workspace.id,
        opportunityId: opportunity.id,
        signalId: signal.id,
        fitAnalysis,
        truth: {
          approvedClaims: claims,
          blockedClaims: [],
          forbiddenClaims: [],
          proofPoints: claims.map((claim) => claim.text),
        },
        research: {
          personas: normalizedResearchPack
            ? [
                {
                  persona: person?.role ?? workspace.primaryIcp,
                  pains: normalizedResearchPack.painSignals,
                  objections: dedupe([...(normalizedResearchPack.objections ?? []), ...(fitAnalysis?.objections ?? [])]),
                  desiredOutcomes: dedupe([...(normalizedResearchPack.proofHooks ?? []), ...(fitAnalysis?.outcomeAngles ?? [])]),
                  channels:
                    normalizedResearchPack.recommendedChannels.length > 0
                      ? normalizedResearchPack.recommendedChannels
                      : opportunity.reachableChannels,
                },
              ]
            : [],
          competitorSnapshot: [],
          marketObjections: dedupe([...(normalizedResearchPack?.objections ?? []), ...(fitAnalysis?.objections ?? [])]),
          opportunities: normalizedResearchPack ? [normalizedResearchPack.nextActionReason] : [],
          channelPriorities:
            normalizedResearchPack && normalizedResearchPack.recommendedChannels.length > 0
              ? normalizedResearchPack.recommendedChannels
              : opportunity.reachableChannels,
          contentAngles: dedupe([...(normalizedResearchPack?.proofHooks ?? []), ...(fitAnalysis?.outcomeAngles ?? [])]),
        },
        positioning: {
          messageHouse: {
            corePromise:
              fitAnalysis?.outcomeAngles[0]
                ? `${brand.name} helps AI teams get ${fitAnalysis.outcomeAngles[0]}.`
                : `${brand.name} helps AI teams remember more and guess less.`,
            pillars: [],
            proofPoints: claims.map((claim) => claim.text),
            proofClaimIds: claims.map((claim) => claim.id),
            objectionMap: fitAnalysis?.primaryPainLabel
              ? {
                  [fitAnalysis.primaryPainLabel]: fitAnalysis.objections,
                }
              : {},
            hookBank: [],
            CTA: "Book a call",
          },
          personaMatrix: [],
          narratives: fitAnalysis?.outcomeAngles ?? [],
        },
      },
      startedAt: isoNow(),
      finishedAt: null,
      error: null,
    });

    const generatedSequence = await runOperatorSequenceWorker({
      llm: this.options.llmProvider ?? { enabled: false, provider: "disabled", generateText: async () => "", generateObject: async () => ({ steps: [] } as never) },
      brand,
      workspace,
      account,
      person,
      signal,
      opportunity,
      claims,
      researchPack: normalizedResearchPack,
      fitAnalysis:
        fitAnalysis ??
        analyzeRetainDbFit({
          title: signal.title,
          content: signal.content,
          source: signal.source,
          accountName: account.name,
          role: person?.role ?? null,
          documents: researchDocuments,
          claims,
        }),
    }).catch(() => null);
    const allowedChannels = new Set<ChannelType>([...opportunity.reachableChannels, "landing"]);
    const allowedClaimIds = new Set(claims.map((claim) => claim.id));
    const steps =
      generatedSequence?.steps
        .map((step) => ({
          channel: step.channel,
          touchType: touchTypeForChannel(step.channel),
          title: step.title,
          body: step.body,
          CTA: step.CTA,
          claimIds: step.claimIds.filter((claimId) => allowedClaimIds.has(claimId)),
        }))
        .filter((step) => allowedChannels.has(step.channel) && step.claimIds.length > 0)
        .slice(0, 5) ?? [];
    const finalizedSteps = steps.length > 0 ? steps : this.sequenceSteps(brand, account, person, signal, opportunity, claims, fitAnalysis);
    const sequence = await this.options.store.createSequence({
      id: createId("sequence"),
      workspaceId: workspace.id,
      brandId: brand.id,
      accountId: account.id,
      personId: person?.id ?? null,
      opportunityId: opportunity.id,
      lane: options?.lane ?? "outbound",
      sourceLane: options?.sourceLane ?? options?.lane ?? "outbound",
      campaignBurstId: options?.campaignBurstId ?? null,
      playbookType: opportunity.recommendedPlaybook,
      status: "review_required",
      title: options?.sequenceTitle ?? `${account.name}: ${opportunity.recommendedPlaybook.replace(/_/g, " ")}`,
      summary: opportunity.reason,
      goal: "booked_conversations",
      touchIds: [],
      runId: run.id,
      campaignId: campaign.id,
      metadata: {
        signalId: signal.id,
        score: opportunity.score,
        laneRunId: options?.laneRunId ?? null,
        researchPack: normalizedResearchPack,
        fitAnalysis,
        generationMode: steps.length > 0 ? "model-assisted" : "deterministic",
      },
    });

    const touchIds: string[] = [];
    for (const step of finalizedSteps) {
      const asset = await this.options.store.createAsset({
        id: createId("asset"),
        brandId: brand.id,
        campaignId: campaign.id,
        runId: run.id,
        channel: step.channel,
        persona: person?.role ?? workspace.primaryIcp,
        title: step.title,
        body: step.body,
        claimIds: step.claimIds,
        status: "draft",
        approvalStage: approvalStageForAsset(step.channel),
        lane: options?.lane ?? "outbound",
        sourceLane: options?.sourceLane ?? options?.lane ?? "outbound",
        campaignBurstId: options?.campaignBurstId ?? null,
        publicationStatus: null,
        metadata: {
          appliedQualifiers: claims.flatMap((claim) => claim.requiredQualifiers.map((item) => item.toLowerCase())),
          accountName: account.name,
          personName: person?.name ?? null,
          painKeywords: dedupe([
            ...PAIN_TERMS.filter((term) => normalize(signal.content).includes(term)),
            ...(fitAnalysis?.primaryPainLabel ? [fitAnalysis.primaryPainLabel] : []),
            ...((fitAnalysis?.outcomeAngles ?? []).slice(0, 3)),
          ]),
          playbookType: opportunity.recommendedPlaybook,
          opportunityScore: opportunity.score,
          signalSource: signal.source,
          laneRunId: options?.laneRunId ?? null,
          CTA: step.CTA,
          researchPack: normalizedResearchPack,
          fitAnalysis,
          generationMode: steps.length > 0 ? "model-assisted" : "deterministic",
        },
      });

      const critique = buildCritique({
        brand,
        asset,
        claims,
      });
      await this.options.store.createCritique(critique);
      const nextAssetStatus = assetStatusFromCritique(critique);
      await this.options.store.updateAsset(asset.id, {
        status: nextAssetStatus,
        metadata: {
          ...asset.metadata,
          critiqueId: critique.id,
          critiqueScore: critique.score,
          blockingIssues: critique.blockingIssues,
          warnings: critique.warnings,
        },
      });

      const touch = await this.options.store.createTouch({
        id: createId("touch"),
        workspaceId: workspace.id,
        brandId: brand.id,
        sequenceId: sequence.id,
        assetId: asset.id,
        channel: step.channel,
        touchType: step.touchType,
        status: nextAssetStatus === "needs_revision" ? "needs_revision" : "review_required",
        title: step.title,
        body: step.body,
        CTA: step.CTA,
        claimIds: step.claimIds,
        lane: options?.lane ?? "outbound",
        sourceLane: options?.sourceLane ?? options?.lane ?? "outbound",
        campaignBurstId: options?.campaignBurstId ?? null,
        publicationStatus: null,
        metadata: {
          opportunityId: opportunity.id,
          signalId: signal.id,
          laneRunId: options?.laneRunId ?? null,
          fitAnalysis,
        },
      });
      touchIds.push(touch.id);
    }

    await this.options.store.updateSequence(sequence.id, {
      touchIds,
      status: touchIds.length > 0 ? "review_required" : "draft",
    });

    await this.options.store.updateRun(run.id, {
      status: "awaiting_human_review",
      approvalStage: "WAITING_FOR_SEND_APPROVAL",
      currentStep: "awaiting_human_review",
      summary: {
        workspaceId: workspace.id,
        opportunityId: opportunity.id,
        touchCount: touchIds.length,
        qualificationScore: fitAnalysis?.qualificationScore ?? null,
        generationMode: steps.length > 0 ? "model-assisted" : "deterministic",
      },
    });

    return this.requireSequence(sequence.id);
  }

  protected sequenceSteps(
    brand: Brand,
    account: ProspectAccount,
    person: ProspectPerson | null,
    signal: Signal,
    opportunity: Opportunity,
    claims: Claim[],
    fitAnalysis: RetainDbFitAnalysis | null,
  ) {
    const intro = person?.name ? `${person.name},` : "Hi there,";
    const primaryPain = fitAnalysis?.primaryPainLabel?.toLowerCase() ?? "memory and grounding pain";
    const outcomeAngle = fitAnalysis?.outcomeAngles[0] ?? "less context rebuilding";
    const matchedProof =
      claims.find((claim) => fitAnalysis?.matchedProofClaimIds.includes(claim.id))?.text ??
      (opportunity.recommendedPlaybook === "benchmark_proof_push"
        ? "88% preference recall. 79% overall accuracy. 0% hallucination on grounded docs."
        : "Three calls. Persistent memory. Zero rearchitecting.");
    const matchedCapability =
      claims.find((claim) => fitAnalysis?.matchedCapabilityClaimIds.includes(claim.id))?.text ??
      `${brand.name} gives AI teams persistent memory across sessions and answers from grounded docs, not model guesses.`;
    const commonLines = [
      `${account.name} looks like a fit for ${primaryPain}.`,
      matchedCapability,
      matchedProof,
      `Main outcome: ${outcomeAngle}.`,
      "If this is useful, I can send a short proof pack or book a call.",
    ];
    const claimIds = claims.map((claim) => claim.id);
    const withClaims = (parts: string[]) => [...parts, `Claims: ${claimIds.join(", ")}`].join("\n\n");

    const steps: Array<{ channel: ChannelType; touchType: TouchType; title: string; body: string; CTA: string; claimIds: string[] }> = [];

    if (opportunity.reachableChannels.includes("outbound")) {
      steps.push({
        channel: "outbound",
        touchType: "email",
        title: `${account.name}: ${outcomeAngle} without a rewrite`,
        body: withClaims([
          intro,
          `Saw the signal around ${signal.title.toLowerCase()}. The visible pain looks like ${primaryPain}.`,
          ...commonLines,
        ]),
        CTA: "Book a call",
        claimIds,
      });
    }

    if (opportunity.reachableChannels.includes("reply")) {
      steps.push({
        channel: "reply",
        touchType: "public_reply",
        title: `${account.name}: founder reply`,
        body: withClaims([
          `Your users remember. Your AI should too.`,
          `What you described maps to a familiar pain: ${primaryPain}.`,
          ...commonLines,
        ]),
        CTA: "Send the proof pack",
        claimIds,
      });
    }

    if (opportunity.reachableChannels.includes("social")) {
      steps.push({
        channel: "social",
        touchType: "post",
        title: `${account.name}: proof-led social angle`,
        body: withClaims([
          "Your AI forgets everything. RetainDB fixes that.",
          `${account.name} is a good example of a team that needs ${outcomeAngle}.`,
          "Read the docs or book a call.",
        ]),
        CTA: "Read the docs",
        claimIds,
      });
    }

    if (opportunity.reachableChannels.includes("community")) {
      steps.push({
        channel: "community",
        touchType: "community_post",
        title: `${account.name}: community angle`,
        body: withClaims([
          `The pain is simple: ${primaryPain}.`,
          `${brand.name} gives teams a path to ${outcomeAngle} without a rewrite.`,
          "Happy to share the proof pack or book a call.",
        ]),
        CTA: "Share the proof pack",
        claimIds,
      });
    }

    steps.push({
      channel: "landing",
      touchType: "landing_variant",
      title: `${account.name}: landing page angle`,
      body: withClaims([
        `Headline: ${account.name} should not have to rebuild for ${primaryPain}.`,
        `Subhead: ${outcomeAngle}. Persistent memory. Grounded docs. Three calls. Works with any LLM. Zero rearchitecting.`,
        "CTA: Book a call.",
      ]),
      CTA: "Book a call",
      claimIds,
    });

    return steps.slice(0, 5);
  }

  protected async ensureOperatorCampaign(workspace: Workspace, brand: Brand) {
    const campaigns = await this.options.store.listCampaignsByBrand(brand.id);
    const existing = campaigns.find((campaign) => campaign.metadata.kind === "gtm_operator" && campaign.metadata.workspaceId === workspace.id);
    if (existing) return existing;

    return this.options.store.createCampaign({
      id: createId("campaign"),
      brandId: brand.id,
      name: `${workspace.name} Operator`,
      goal: "Book conversations from high-signal opportunities",
      campaignType: "other",
      targetPersonas: [workspace.primaryIcp],
      channels: ["outbound", "reply", "social", "community", "landing"],
      brief: "Signals in. Best next action out.",
      constraints: ["Approval before send", "No autonomous publishing"],
      status: "draft",
      metadata: {
        kind: "gtm_operator",
        workspaceId: workspace.id,
      },
    });
  }

  protected async ensureAccount(workspace: Workspace, brand: Brand, accountInput?: { id?: string; name: string; domain?: string | null; summary?: string }) {
    if (accountInput?.id) {
      const existing = await this.options.store.findProspectAccountById(accountInput.id);
      if (existing) return existing;
    }
    const accounts = await this.options.store.listProspectAccountsByWorkspace(workspace.id);
    const existing = accounts.find((account) => accountInput && (account.domain && accountInput.domain ? account.domain === accountInput.domain : account.name === accountInput.name));
    if (existing) return existing;

    return this.options.store.createProspectAccount({
      id: accountInput?.id ?? createId("account"),
      workspaceId: workspace.id,
      brandId: brand.id,
      name: accountInput?.name ?? "Unknown account",
      domain: accountInput?.domain ?? null,
      summary: accountInput?.summary ?? "High-signal account for founder-led GTM.",
      stage: "signal",
      fitScore: 70,
      channels: ["outbound", "reply", "social", "community", "landing"],
      metadata: {},
    });
  }

  protected async ensurePerson(
    workspace: Workspace,
    brand: Brand,
    account: ProspectAccount,
    personInput?: { id?: string; name: string; role: string; email?: string | null; socialHandle?: string | null },
  ) {
    if (!personInput) return null;
    if (personInput.id) {
      const existing = await this.options.store.findProspectPersonById(personInput.id);
      if (existing) return existing;
    }
    const people = await this.options.store.listProspectPeopleByAccount(account.id);
    const existing = people.find((person) => (personInput.email && person.email === personInput.email) || person.name === personInput.name);
    if (existing) return existing;

    return this.options.store.createProspectPerson({
      id: personInput.id ?? createId("person"),
      workspaceId: workspace.id,
      brandId: brand.id,
      accountId: account.id,
      name: personInput.name,
      role: personInput.role,
      email: personInput.email ?? null,
      socialHandle: personInput.socialHandle ?? null,
      personaFit: founderScore(personInput.role),
      metadata: {},
    });
  }

  protected stageForConversationStatus(status: Conversation["status"]): OpportunityStage {
    switch (status) {
      case "booked":
        return "booked";
      case "qualified":
        return "qualified";
      case "paid":
        return "paid";
      case "closed_lost":
        return "closed_lost";
      case "active":
      default:
        return "replied";
    }
  }

  protected metricsForConversationStatus(status: Conversation["status"]): GoalMetric[] {
    if (status === "paid") return ["booked_conversations", "paid_users"];
    if (status === "booked" || status === "qualified") return ["booked_conversations"];
    if (status === "active") return ["replies"];
    return [];
  }

  protected async syncSequenceAndRun(sequenceId: string) {
    const sequence = await this.requireSequence(sequenceId);
    const touches = await this.options.store.listTouchesBySequence(sequenceId);
    const assets = await Promise.all(touches.map((touch) => this.requireAsset(touch.assetId)));
    const run = await this.requireRun(sequence.runId);
    const nextRunStatus = runStatusAfterApproval(assets);

    const nextSequenceStatus =
      nextRunStatus === "completed"
        ? "approved"
        : nextRunStatus === "revision_required"
          ? "needs_revision"
          : "review_required";

    await this.options.store.updateSequence(sequence.id, { status: nextSequenceStatus });
    await this.options.store.updateRun(run.id, {
      status: nextRunStatus,
      currentStep: nextRunStatus === "completed" ? "completed" : nextRunStatus,
      finishedAt: nextRunStatus === "completed" ? isoNow() : run.finishedAt ?? null,
    });
    await this.options.store.updateCampaign(sequence.campaignId, {
      status: nextRunStatus === "completed" ? "completed" : nextRunStatus === "revision_required" ? "blocked" : "waiting_for_approval",
    });
  }

  protected async requireWorkspace(id: string) {
    const workspace = await this.options.store.findWorkspaceById(id);
    if (!workspace) throw new Error(`Workspace not found: ${id}`);
    return workspace;
  }

  protected async requireBrand(id: string) {
    const brand = await this.options.store.findBrandById(id);
    if (!brand) throw new Error(`Brand not found: ${id}`);
    return brand;
  }

  protected async requireTouch(id: string) {
    const touch = await this.options.store.findTouchById(id);
    if (!touch) throw new Error(`Touch not found: ${id}`);
    return touch;
  }

  protected async requireAsset(id: string) {
    const asset = await this.options.store.findAssetById(id);
    if (!asset) throw new Error(`Asset not found: ${id}`);
    return asset;
  }

  protected async requireCritique(assetId: string) {
    const critique = await this.options.store.findCritiqueByAsset(assetId);
    if (!critique) throw new Error(`Critique not found for asset: ${assetId}`);
    return critique;
  }

  protected async requireSequence(id: string) {
    const sequence = await this.options.store.findSequenceById(id);
    if (!sequence) throw new Error(`Sequence not found: ${id}`);
    return sequence;
  }

  protected async requireOpportunity(id: string) {
    const opportunity = await this.options.store.findOpportunityById(id);
    if (!opportunity) throw new Error(`Opportunity not found: ${id}`);
    return opportunity;
  }

  protected async requireRun(id: string) {
    const run = await this.options.store.findRunById(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    return run;
  }
}
