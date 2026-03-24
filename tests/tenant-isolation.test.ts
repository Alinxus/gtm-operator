import { describe, expect, it } from "vitest";
import { InMemoryMarketingStore } from "../src/store/in-memory-store.js";
import { MockMemoryProvider } from "../src/memory.js";
import { createId } from "../src/domain.js";
import { GtmOperator } from "../src/gtm-operator.js";
import { GrowthOperator } from "../src/growth-operator.js";

describe("tenant isolation", () => {
  it("keeps claims, campaigns, and memory scoped to the brand", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();

    const brandA = await store.createBrand({
      id: createId("brand"),
      slug: "brand-a",
      name: "Brand A",
      description: "Tenant A",
      memoryProvider: "mock",
      memoryProject: "brand-a-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    const brandB = await store.createBrand({
      id: createId("brand"),
      slug: "brand-b",
      name: "Brand B",
      description: "Tenant B",
      memoryProvider: "mock",
      memoryProject: "brand-b-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    await store.upsertClaim({
      id: "claim-a",
      brandId: brandA.id,
      category: "feature",
      status: "verified",
      text: "Brand A claim",
      sourceUrls: ["https://example.com/a"],
      sourceExcerpt: "A",
      requiredQualifiers: ["a"],
      allowedChannels: ["social"],
      forbiddenVariants: [],
      owner: "team-a",
      metadata: {},
      lastVerifiedAt: null,
    });

    await store.upsertClaim({
      id: "claim-b",
      brandId: brandB.id,
      category: "feature",
      status: "verified",
      text: "Brand B claim",
      sourceUrls: ["https://example.com/b"],
      sourceExcerpt: "B",
      requiredQualifiers: ["b"],
      allowedChannels: ["social"],
      forbiddenVariants: [],
      owner: "team-b",
      metadata: {},
      lastVerifiedAt: null,
    });

    const brandAClaims = await store.listClaimsByBrand(brandA.id);
    const brandBClaims = await store.listClaimsByBrand(brandB.id);

    expect(brandAClaims).toHaveLength(1);
    expect(brandBClaims).toHaveLength(1);
    expect(brandAClaims[0]?.id).toBe("claim-a");
    expect(brandBClaims[0]?.id).toBe("claim-b");

    await memory.add({
      project: brandA.memoryProject,
      scope: "brand",
      memoryType: "instruction",
      content: "Brand A voice note",
      namespace: `brand:${brandA.slug}`,
      tags: [brandA.slug],
      importance: 0.8,
    });

    await memory.add({
      project: brandB.memoryProject,
      scope: "brand",
      memoryType: "instruction",
      content: "Brand B voice note",
      namespace: `brand:${brandB.slug}`,
      tags: [brandB.slug],
      importance: 0.8,
    });

    const brandASearch = await memory.search({
      query: "voice note",
      project: brandA.memoryProject,
      namespace: `brand:${brandA.slug}`,
      memoryTypes: ["instruction"],
      limit: 10,
    });
    const brandBSearch = await memory.search({
      query: "voice note",
      project: brandB.memoryProject,
      namespace: `brand:${brandB.slug}`,
      memoryTypes: ["instruction"],
      limit: 10,
    });

    expect(brandASearch).toHaveLength(1);
    expect(brandBSearch).toHaveLength(1);
    expect(brandASearch[0]?.content).toContain("Brand A");
    expect(brandBSearch[0]?.content).toContain("Brand B");
  });

  it("keeps workspaces, signals, and opportunities isolated per tenant", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const operator = new GtmOperator({ store, memoryProvider: memory });

    const brandA = await store.createBrand({
      id: createId("brand"),
      slug: "brand-a",
      name: "Brand A",
      description: "Tenant A",
      memoryProvider: "mock",
      memoryProject: "brand-a-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    const brandB = await store.createBrand({
      id: createId("brand"),
      slug: "brand-b",
      name: "Brand B",
      description: "Tenant B",
      memoryProvider: "mock",
      memoryProject: "brand-b-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    const workspaceA = await operator.ensureDefaultWorkspace(brandA);
    const workspaceB = await operator.ensureDefaultWorkspace(brandB);

    await operator.ingestSignal({
      workspaceId: workspaceA.id,
      source: "manual",
      title: "Brand A signal",
      content: "Founder needs help with memory and context.",
      account: { name: "Acme A" },
      person: { name: "Alice", role: "Founder" },
    });

    await operator.ingestSignal({
      workspaceId: workspaceB.id,
      source: "manual",
      title: "Brand B signal",
      content: "Founder needs help with grounded docs and memory.",
      account: { name: "Acme B" },
      person: { name: "Bob", role: "Founder" },
    });

    const accountsA = await store.listProspectAccountsByWorkspace(workspaceA.id);
    const accountsB = await store.listProspectAccountsByWorkspace(workspaceB.id);
    const opportunitiesA = await store.listOpportunitiesByWorkspace(workspaceA.id);
    const opportunitiesB = await store.listOpportunitiesByWorkspace(workspaceB.id);

    expect(accountsA).toHaveLength(1);
    expect(accountsB).toHaveLength(1);
    expect(accountsA[0]?.name).toBe("Acme A");
    expect(accountsB[0]?.name).toBe("Acme B");
    expect(opportunitiesA).toHaveLength(1);
    expect(opportunitiesB).toHaveLength(1);
    expect(opportunitiesA[0]?.workspaceId).toBe(workspaceA.id);
    expect(opportunitiesB[0]?.workspaceId).toBe(workspaceB.id);
  });

  it("keeps lane runs and publish destinations isolated per workspace", async () => {
    const store = new InMemoryMarketingStore();
    const memory = new MockMemoryProvider();
    const operator = new GrowthOperator({ store, memoryProvider: memory });

    const brandA = await store.createBrand({
      id: createId("brand"),
      slug: "brand-a",
      name: "Brand A",
      description: "Tenant A",
      memoryProvider: "mock",
      memoryProject: "brand-a-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    const brandB = await store.createBrand({
      id: createId("brand"),
      slug: "brand-b",
      name: "Brand B",
      description: "Tenant B",
      memoryProvider: "mock",
      memoryProject: "brand-b-memory",
      voice: {
        tone: "proof-first",
        styleRules: [],
        preferredPhrases: [],
        forbiddenPhrases: [],
        founderVoiceNotes: [],
      },
    });

    const workspaceA = await operator.ensureDefaultWorkspace(brandA);
    const workspaceB = await operator.ensureDefaultWorkspace(brandB);

    await operator.createPublishDestination({
      workspaceId: workspaceA.id,
      kind: "webhook_export",
      name: "A webhook",
      supportedChannels: ["social"],
      config: { targetUrl: "https://example.com/a" },
    });
    await operator.createPublishDestination({
      workspaceId: workspaceB.id,
      kind: "webhook_export",
      name: "B webhook",
      supportedChannels: ["social"],
      config: { targetUrl: "https://example.com/b" },
    });

    await operator.generateSocialCalendar({ workspaceId: workspaceA.id, count: 1 });
    await operator.generateSocialCalendar({ workspaceId: workspaceB.id, count: 1 });

    const laneRunsA = await operator.listLaneRuns(workspaceA.id);
    const laneRunsB = await operator.listLaneRuns(workspaceB.id);
    const destinationsA = await operator.listPublishDestinations(workspaceA.id);
    const destinationsB = await operator.listPublishDestinations(workspaceB.id);

    expect(laneRunsA.every((run) => run.workspaceId === workspaceA.id)).toBe(true);
    expect(laneRunsB.every((run) => run.workspaceId === workspaceB.id)).toBe(true);
    expect(destinationsA).toHaveLength(1);
    expect(destinationsB).toHaveLength(1);
    expect(destinationsA[0]?.name).toBe("A webhook");
    expect(destinationsB[0]?.name).toBe("B webhook");
  });
});
