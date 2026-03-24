import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";
import { GrowthOperator } from "../src/growth-operator.js";
import { buildGitHubContentPath, buildWebhookExportPayload } from "../src/publishing.js";

describe("publishing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds GitHub and webhook payloads from approved assets", async () => {
    const payload = buildWebhookExportPayload({
      destination: {
        id: "dest_1",
        workspaceId: "ws_1",
        brandId: "brand_1",
        kind: "webhook_export",
        name: "Ops webhook",
        supportedChannels: ["social"],
        config: { targetUrl: "https://example.com/hook" },
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      brand: {
        id: "brand_1",
        slug: "retaindb",
        name: "RetainDB",
        description: null,
        memoryProvider: "mock",
        memoryProject: "test",
        voice: {
          tone: "proof-first",
          styleRules: [],
          preferredPhrases: [],
          forbiddenPhrases: [],
          founderVoiceNotes: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      workspace: {
        id: "ws_1",
        brandId: "brand_1",
        slug: "retaindb-gtm",
        name: "RetainDB GTM",
        description: null,
        primaryIcp: "AI founders",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      asset: {
        id: "asset_1",
        brandId: "brand_1",
        campaignId: "campaign_1",
        runId: "run_1",
        channel: "seo",
        persona: "Founder",
        title: "Persistent memory for AI agents",
        body: "Three calls. Persistent memory.",
        claimIds: ["retainedb-three-calls"],
        status: "approved",
        approvalStage: "WAITING_FOR_PUBLISH_APPROVAL",
        lane: "seo",
        sourceLane: "seo",
        campaignBurstId: null,
        publicationStatus: null,
        publishMetadata: null,
        metadata: { slug: "persistent-memory-ai-agents" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      touch: null,
    });

    expect(payload.asset.title).toContain("Persistent memory");

    const path = buildGitHubContentPath({
      destination: {
        id: "dest_2",
        workspaceId: "ws_1",
        brandId: "brand_1",
        kind: "github_pr",
        name: "GitHub",
        supportedChannels: ["seo", "landing"],
        config: {
          owner: "retaindb",
          repo: "site",
          contentRoot: "content/pages",
          pathTemplate: "{{content_root}}/{{slug}}.mdx",
        },
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      brand: payload.brand,
      workspace: payload.workspace,
      asset: {
        ...payload.asset,
        channel: "seo",
      },
      touch: null,
    });

    expect(path).toBe("content/pages/persistent-memory-ai-agents.mdx");
  });

  it("creates a webhook publish job and marks the touch sent after export", async () => {
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

    const social = await operator.generateSocialCalendar({
      workspaceId: workspace.id,
      count: 1,
    });
    const touch = social.sequence.touchIds[0];
    expect(touch).toBeTruthy();
    if (!touch) throw new Error("Expected social touch");

    const approvalItems = await operator.listApprovals(workspace.id);
    for (const item of approvalItems) {
      await operator.recordTouchDecision({
        touchId: item.touch.id,
        reviewer: "tester",
        decision: item.critique?.blockingIssues.length ? "override" : "approve",
        reason: "Ready to publish",
        overrideReason: item.critique?.blockingIssues.length ? "Accepting the draft for publish coverage." : undefined,
      });
    }

    const destination = await operator.createPublishDestination({
      workspaceId: workspace.id,
      kind: "webhook_export",
      name: "Manual posting webhook",
      supportedChannels: ["social", "community", "reply", "outbound", "partnership"],
      config: {
        targetUrl: "https://example.com/hook",
      },
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/hook") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "x-request-id": "req_123" },
        });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const publish = await operator.publishTouch({
      touchId: touch,
      destinationId: destination.id,
    });

    expect(publish.job.status).toBe("published");
    expect(fetchMock).toHaveBeenCalled();

    const updatedTouch = await store.findTouchById(touch);
    expect(updatedTouch?.status).toBe("sent");

    const jobs = await operator.listPublishJobs(workspace.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe("webhook_export");
  });
});
