import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { MarketingOrchestrator } from "../src/orchestrator.js";
import { GtmOperator } from "../src/gtm-operator.js";

describe("gtm operator", () => {
  it("turns a signal into an approval-ready sequence and learns from outcomes", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const orchestrator = new MarketingOrchestrator({ store, memoryProvider: memory });
    const operator = new GtmOperator({ store, memoryProvider: memory });

    await orchestrator.seed();

    const brand = await store.findBrandBySlug("retaindb");
    expect(brand).toBeTruthy();
    if (!brand) throw new Error("RetainDB brand missing after seed");

    const workspace = await store.findWorkspaceBySlug(brand.id, "retaindb-gtm");
    expect(workspace).toBeTruthy();
    if (!workspace) throw new Error("Workspace missing after seed");

    const created = await operator.ingestSignal({
      workspaceId: workspace.id,
      source: "x",
      title: "Founder is complaining about context loss",
      content:
        "An AI founder says their assistant forgets user preferences, loses docs context, and they want something easy to integrate with real proof.",
      account: {
        name: "Acme AI",
        domain: "acme.ai",
        summary: "AI product team shipping workflow agents.",
      },
      person: {
        name: "Jane Founder",
        role: "Founder",
        email: "jane@acme.ai",
        socialHandle: "@janefounder",
      },
    });

    expect(created.signal.source).toBe("x");
    expect(created.opportunity.score).toBeGreaterThan(50);
    expect((created.opportunity.metadata.fitAnalysis as { primaryPainId?: string } | undefined)?.primaryPainId).toBe(
      "user_preference_memory",
    );
    expect(
      (created.opportunity.metadata.fitAnalysis as { matchedProofClaimIds?: string[] } | undefined)?.matchedProofClaimIds ?? [],
    ).toContain("retainedb-preference-recall-88");
    expect(created.sequence).toBeTruthy();

    const touches = await store.listTouchesBySequence(created.sequence!.id);
    expect(touches.length).toBeGreaterThan(0);

    const approvals = await operator.listApprovals(workspace.id);
    expect(approvals.length).toBe(touches.length);

    for (const approval of approvals) {
      if ((approval.critique?.blockingIssues.length ?? 0) > 0) {
        await operator.recordTouchDecision({
          touchId: approval.touch.id,
          reviewer: "human",
          decision: "override",
          reason: "Acceptable for operator test",
          overrideReason: "Deliberate override for GTM operator integration coverage.",
        });
      } else {
        await operator.recordTouchDecision({
          touchId: approval.touch.id,
          reviewer: "human",
          decision: "approve",
          reason: "Looks good",
        });
      }
    }

    const updatedRun = await store.findRunById(created.sequence!.runId);
    const updatedSequence = await store.findSequenceById(created.sequence!.id);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedSequence?.status).toBe("approved");

    const sendableTouch = (await store.listTouchesBySequence(created.sequence!.id)).find(
      (touch) => touch.status === "approved" || touch.status === "approved_with_exceptions",
    );
    expect(sendableTouch).toBeTruthy();
    if (!sendableTouch) throw new Error("No sendable touch generated");

    await operator.markTouchSent(sendableTouch.id);

    const afterSendOpportunity = await store.findOpportunityById(created.opportunity.id);
    const afterSendAccount = await store.findProspectAccountById(created.account.id);
    expect(afterSendOpportunity?.stage).toBe("touched");
    expect(afterSendAccount?.stage).toBe("touched");

    const conversation = await operator.recordConversation({
      workspaceId: workspace.id,
      accountId: created.account.id,
      personId: created.person?.id,
      opportunityId: created.opportunity.id,
      touchId: sendableTouch.id,
      status: "paid",
      summary: "Booked quickly off the proof pack and converted.",
    });

    expect(conversation.status).toBe("paid");

    const paidAccount = await store.findProspectAccountById(created.account.id);
    const paidOpportunity = await store.findOpportunityById(created.opportunity.id);
    expect(paidAccount?.stage).toBe("paid");
    expect(paidOpportunity?.stage).toBe("paid");

    const goals = await store.listGoalsByWorkspace(workspace.id);
    expect(goals.find((goal) => goal.targetMetric === "booked_conversations")?.currentValue).toBe(1);
    expect(goals.find((goal) => goal.targetMetric === "paid_users")?.currentValue).toBe(1);

    const memoryHits = await memory.search({
      query: "Conversation update",
      project: brand.memoryProject,
      namespace: `account:${created.account.id}`,
      memoryTypes: ["event"],
      limit: 10,
    });

    expect(memoryHits.some((hit) => hit.content.includes("paid"))).toBe(true);
  });
});
