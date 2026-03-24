import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";
import { createId, isoNow } from "../src/domain.js";
import { retainedbTruthPack } from "../src/seed/retaindb-truth-pack.js";

describe("approval overrides", () => {
  it("requires an explicit override for critic rejections and completes after override", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const orchestrator = new MarketingOrchestrator({ store, memoryProvider: memory });

    const brand = await store.createBrand({
      id: createId("brand"),
      slug: "retaindb",
      name: "RetainDB",
      description: "Memory and context",
      memoryProvider: "mock",
      memoryProject: "retaindb-marketing",
      voice: retainedbTruthPack.publicVoice,
    });

    const campaign = await store.createCampaign({
      id: createId("campaign"),
      brandId: brand.id,
      name: "Manual campaign",
      goal: "Test overrides",
      campaignType: "launch",
      targetPersonas: ["AI founder"],
      channels: ["social"],
      brief: "Manual approval test",
      constraints: [],
      status: "draft",
      metadata: {},
    });

    const run = await store.createRun({
      id: createId("run"),
      brandId: brand.id,
      campaignId: campaign.id,
      status: "awaiting_human_review",
      approvalStage: "WAITING_FOR_ASSET_APPROVAL",
      currentStep: "awaiting_human_review",
      summary: {},
      metadata: {
        truth: {
          approvedClaims: [],
          blockedClaims: [],
          forbiddenClaims: [],
          proofPoints: [],
        },
        research: {
          personas: [],
          competitorSnapshot: [],
          marketObjections: [],
          opportunities: [],
          channelPriorities: ["social"],
          contentAngles: [],
        },
        positioning: {
          messageHouse: {
            corePromise: "proof-first",
            pillars: [],
            proofPoints: [],
            proofClaimIds: [],
            objectionMap: {},
            hookBank: [],
            CTA: "Reply",
          },
          personaMatrix: [],
          narratives: [],
        },
      },
      startedAt: isoNow(),
      finishedAt: null,
      error: null,
    });

    const asset = await store.createAsset({
      id: createId("asset"),
      brandId: brand.id,
      campaignId: campaign.id,
      runId: run.id,
      channel: "social",
      persona: "AI founder",
      title: "Blocked post",
      body: "This is unsupported.",
      claimIds: [],
      status: "needs_revision",
      approvalStage: "WAITING_FOR_MESSAGE_APPROVAL",
      metadata: {},
    });

    await store.createCritique({
      id: createId("critique"),
      brandId: brand.id,
      campaignId: campaign.id,
      runId: run.id,
      assetId: asset.id,
      score: 12,
      blockingIssues: ["Asset must cite at least one claim id."],
      warnings: [],
      notes: [],
      reviewer: "critic-worker",
    });

    await expect(
      orchestrator.approveAsset({
        assetId: asset.id,
        reviewer: "human",
        decision: "approve",
        reason: "Looks fine",
      }),
    ).rejects.toThrow(/requires override or revise/i);

    const bundle = await orchestrator.overrideAsset({
      assetId: asset.id,
      reviewer: "human",
      reason: "Accepting the risk",
      overrideReason: "Human reviewer accepted the missing citation for this internal test asset.",
    });

    expect(bundle.run.status).toBe("completed");
    expect(bundle.approvals).toHaveLength(1);
    expect(bundle.assets[0]?.status).toBe("approved_with_exceptions");
  });
});
