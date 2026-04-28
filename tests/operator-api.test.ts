import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";
import { createApp } from "../src/api.js";

describe("operator api", () => {
  it("serves the dashboard, accepts signals, and exposes approvals through v2 routes", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const orchestrator = new MarketingOrchestrator({ store, memoryProvider: memory });

    await orchestrator.seed();

    const brand = await store.findBrandBySlug("retaindb");
    expect(brand).toBeTruthy();
    if (!brand) throw new Error("RetainDB brand missing after seed");

    const workspace = await store.findWorkspaceBySlug(brand.id, "retaindb-gtm");
    expect(workspace).toBeTruthy();
    if (!workspace) throw new Error("Workspace missing after seed");

    const app = createApp({
      store,
      memoryProvider: memory,
      config: {
        port: 8788,
        databaseUrl: undefined,
        retainedbBaseUrl: "https://api.retaindb.test",
        retainedbApiKey: "test-key",
        retainedbProject: "retaindb-marketing",
        defaultBrandSlug: "retaindb",
        defaultMemoryProvider: "mock",
        defaultLlmProvider: "disabled",
        openaiBaseUrl: "https://api.openai.com/v1",
        openaiApiKey: undefined,
        openaiModel: "gpt-4.1-mini",
        anthropicApiKey: undefined,
        anthropicModel: "claude-sonnet-4-6",
        githubToken: undefined,
        githubAppId: undefined,
        githubAppPrivateKey: undefined,
        githubAppInstallationId: undefined,
        defaultGithubPublishOwner: undefined,
        defaultGithubPublishRepo: undefined,
        defaultGithubPublishBaseBranch: undefined,
        defaultGithubPublishContentRoot: undefined,
        defaultGithubPublishPathTemplate: undefined,
        defaultWebhookPublishUrl: undefined,
        defaultWebhookPublishSecret: undefined,
        corsAllowedOrigins: ["*"],
        cloudflareAccountId: undefined,
        cloudflareApiToken: undefined,
        xBearerToken: undefined,
        redditBearerToken: undefined,
        linkedinAccessToken: undefined,
        researchHttpUserAgent: "RetainDB-GTM-Operator/Test",
        seedOnBoot: false,
        allowInMemoryStore: true,
        allowMockMemoryProvider: true,
        resendFromName: "Founder",
        cronSignalSources: ["x", "reddit", "hn", "yc", "github"],
        cronMaxSignalsPerTick: 50,
      },
    });

    const dashboardResponse = await app.request(`/v2/workspaces/${workspace.id}/dashboard`);
    expect(dashboardResponse.status).toBe(200);
    const dashboard = await dashboardResponse.json();
    expect(dashboard.workspace.id).toBe(workspace.id);

    const htmlResponse = await app.request(`/app/${workspace.id}`);
    expect(htmlResponse.status).toBe(200);
    const html = await htmlResponse.text();
    expect(html).toContain("Signals in. Best next action out.");
    expect(html).toContain("Approval before send");

    const signalResponse = await app.request(`/v2/workspaces/${workspace.id}/signals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "manual",
        title: "Docs visitor wants grounded answers",
        content:
          "A founder asked for persistent memory, grounded docs, and proof that it works without a rewrite.",
        account: {
          name: "Orbit AI",
          domain: "orbit.ai",
          summary: "AI product team evaluating memory infrastructure.",
        },
        person: {
          name: "Omar",
          role: "Founder",
          email: "omar@orbit.ai",
        },
      }),
    });

    expect(signalResponse.status).toBe(201);
    const signalPayload = await signalResponse.json();
    expect(signalPayload.opportunity.score).toBeGreaterThan(0);

    const approvalsResponse = await app.request(`/v2/workspaces/${workspace.id}/approvals`);
    expect(approvalsResponse.status).toBe(200);
    const approvalsPayload = await approvalsResponse.json();
    expect(approvalsPayload.approvals.length).toBeGreaterThan(0);

    const lanesResponse = await app.request(`/v2/workspaces/${workspace.id}/lanes`);
    expect(lanesResponse.status).toBe(200);
    const lanesPayload = await lanesResponse.json();
    expect(lanesPayload.lanes.some((lane: { lane: string }) => lane.lane === "outbound")).toBe(true);

    const socialResponse = await app.request(`/v2/workspaces/${workspace.id}/social/calendar/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        count: 2,
        focus: "persistent memory",
      }),
    });
    expect(socialResponse.status).toBe(201);

    const seoClusterResponse = await app.request(`/v2/workspaces/${workspace.id}/seo/topic-clusters/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        count: 2,
      }),
    });
    expect(seoClusterResponse.status).toBe(201);

    const burstResponse = await app.request(`/v2/workspaces/${workspace.id}/campaign-bursts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        burstType: "benchmark",
        brief: "Push measured proof across all three lanes.",
      }),
    });
    expect(burstResponse.status).toBe(201);

    const firstApproval = approvalsPayload.approvals[0];
    const approvalRoute =
      firstApproval.critique?.blockingIssues?.length > 0
        ? `/v2/touches/${firstApproval.touch.id}/override`
        : `/v2/touches/${firstApproval.touch.id}/approve`;
    const approvalBody =
      firstApproval.critique?.blockingIssues?.length > 0
        ? {
            reviewer: "operator",
            reason: "Override for API test",
            overrideReason: "Intentional override in operator route test.",
          }
        : {
            reviewer: "operator",
            reason: "Approve via API",
          };

    const approveResponse = await app.request(approvalRoute, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(approvalBody),
    });

    expect(approveResponse.status).toBe(200);
  });
});
