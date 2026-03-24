import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";

describe("orchestrator end-to-end", () => {
  it("seeds RetainDB, runs a campaign, and finishes after approvals", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const orchestrator = new MarketingOrchestrator({ store, memoryProvider: memory });

    await orchestrator.seed();

    const brand = await store.findBrandBySlug("retaindb");
    expect(brand).toBeTruthy();
    if (!brand) throw new Error("RetainDB brand missing after seed");
    expect(brand.voice.tone).toContain("builder-native");

    const campaign = await orchestrator.createCampaign({
      brandId: brand.id,
      name: "Launch week",
      goal: "Generate thoughtful distribution assets",
      campaignType: "launch",
      targetPersonas: ["AI founder", "Infra engineer"],
      channels: [],
      brief: "Launch the RetainDB marketing orchestrator.",
      constraints: ["No paid ads", "No auto-publish"],
      status: "draft",
      metadata: {},
    });

    const started = await orchestrator.startCampaignRun(campaign.id);

    expect(started.run.status).toBe("awaiting_human_review");
    expect(started.assets.length).toBeGreaterThan(0);
    expect(started.critiques.length).toBe(started.assets.length);
    expect(started.assets.some((asset) => asset.body.includes("Your AI forgets everything."))).toBe(true);
    expect(started.assets.some((asset) => asset.body.includes("Three calls."))).toBe(true);

    for (const asset of started.assets) {
      if (asset.status === "needs_revision") {
        await orchestrator.overrideAsset({
          assetId: asset.id,
          reviewer: "human",
          reason: "Accept for launch",
          overrideReason: "Needed for test coverage.",
        });
      } else {
        await orchestrator.approveAsset({
          assetId: asset.id,
          reviewer: "human",
          decision: "approve",
          reason: "Approved",
        });
      }
    }

    const completed = await orchestrator.resumeRun(started.run.id);
    expect(completed.run.status).toBe("completed");
    expect(completed.approvals.length).toBe(started.assets.length);

    const memoryHits = await memory.search({
      query: "campaign launch",
      project: brand.memoryProject,
      namespace: `campaign:${campaign.id}`,
      memoryTypes: ["goal"],
      limit: 10,
    });

    expect(memoryHits.length).toBeGreaterThan(0);
  });
});
