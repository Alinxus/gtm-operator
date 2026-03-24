import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";
import { GrowthOperator } from "../src/growth-operator.js";

describe("growth operator", () => {
  it("generates social, seo, and campaign lane outputs on top of the GTM core", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const orchestrator = new MarketingOrchestrator({ store, memoryProvider: memory });
    const operator = new GrowthOperator({ store, memoryProvider: memory });

    await orchestrator.seed();

    const brand = await store.findBrandBySlug("retaindb");
    expect(brand).toBeTruthy();
    if (!brand) throw new Error("RetainDB brand missing after seed");

    const workspace = await store.findWorkspaceBySlug(brand.id, "retaindb-gtm");
    expect(workspace).toBeTruthy();
    if (!workspace) throw new Error("Workspace missing after seed");

    await operator.ingestSignal({
      workspaceId: workspace.id,
      source: "manual",
      title: "Founder keeps losing user context",
      content: "Our assistant forgets user preferences across sessions and the docs answers drift.",
      account: { name: "Orbit AI", domain: "orbit.ai", summary: "AI product team shipping agent workflows." },
      person: { name: "Omar", role: "Founder", email: "omar@orbit.ai" },
      autoGenerateSequence: false,
    });

    const social = await operator.generateSocialCalendar({
      workspaceId: workspace.id,
      count: 3,
      focus: "persistent memory",
    });
    expect(social.laneRun?.lane).toBe("social");
    expect(social.calendarItems.length).toBeGreaterThan(0);
    expect(social.socialAssets.length).toBeGreaterThan(0);

    const seoClusters = await operator.generateTopicClusters({
      workspaceId: workspace.id,
      count: 2,
    });
    expect(seoClusters.topicClusters.length).toBeGreaterThan(0);

    const seoPages = await operator.generateSeoPages({
      workspaceId: workspace.id,
      count: 2,
    });
    expect(seoPages.laneRun?.lane).toBe("seo");
    expect(seoPages.pages.length).toBeGreaterThan(0);
    expect(seoPages.pages[0]?.slug).toBeTruthy();

    const burst = await operator.createCampaignBurst({
      workspaceId: workspace.id,
      burstType: "benchmark",
      brief: "Push measured proof across outbound, social, and SEO.",
    });
    expect(burst.campaignBurst?.burstType).toBe("benchmark");
    expect(burst.socialAssets.length).toBeGreaterThan(0);
    expect(burst.pages.length).toBeGreaterThan(0);

    const laneRuns = await operator.listLaneRuns(workspace.id);
    expect(laneRuns.some((run) => run.lane === "social")).toBe(true);
    expect(laneRuns.some((run) => run.lane === "seo")).toBe(true);
    expect(laneRuns.some((run) => run.lane === "campaign")).toBe(true);

    const dashboard = await operator.getWorkspaceDashboard(workspace.id);
    expect(dashboard.lanes?.summary.length).toBe(4);
  });
});
