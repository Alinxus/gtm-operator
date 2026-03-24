import { describe, expect, it } from "vitest";
import { buildCritique } from "../src/scoring.js";
import type { Asset, Brand, Claim } from "../src/domain.js";

function brand(): Brand {
  return {
    id: "brand-1",
    slug: "retaindb",
    name: "RetainDB",
    description: "Memory and context",
    memoryProvider: "mock",
    memoryProject: "retaindb-marketing",
    voice: {
      tone: "technical, direct, builder-native, proof-first",
      styleRules: [],
      preferredPhrases: [],
      forbiddenPhrases: ["best in the world"],
      founderVoiceNotes: [],
    },
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
  };
}

function claim(status: Claim["status"] = "verified"): Claim {
  return {
    id: "claim-1",
    brandId: "brand-1",
    category: "feature",
    status,
    text: "RetainDB gives AI products persistent memory across sessions.",
    sourceUrls: ["https://www.retaindb.com/"],
    sourceExcerpt: "Persistent memory across sessions.",
    requiredQualifiers: ["persistent memory"],
    allowedChannels: ["social", "outbound", "seo", "community", "reply", "partnership", "landing"],
    forbiddenVariants: ["best in the world"],
    owner: "product",
    metadata: {},
    lastVerifiedAt: "2026-03-22T00:00:00.000Z",
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    brandId: "brand-1",
    campaignId: "campaign-1",
    runId: "run-1",
    channel: "social",
    persona: "AI founder",
    title: "Social post",
    body: "Your AI forgets everything. RetainDB adds persistent memory across sessions. Reply for the docs.\n\nClaims: claim-1",
    claimIds: ["claim-1"],
    status: "draft",
    approvalStage: "WAITING_FOR_MESSAGE_APPROVAL",
    metadata: { appliedQualifiers: ["persistent memory"] },
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("critic scoring", () => {
  it("allows supported proof-first content", () => {
    const critique = buildCritique({
      brand: brand(),
      asset: asset(),
      claims: [claim()],
    });

    expect(critique.blockingIssues).toHaveLength(0);
    expect(critique.score).toBeGreaterThan(70);
  });

  it("blocks unsupported or forbidden claims", () => {
    const critique = buildCritique({
      brand: brand(),
      asset: asset({
        claimIds: ["claim-1"],
        body: "RetainDB is the best memory system in the world.\n\nClaims: claim-1",
      }),
      claims: [claim("forbidden")],
    });

    expect(critique.blockingIssues.length).toBeGreaterThan(0);
    expect(critique.score).toBeLessThan(70);
  });

  it("flags weak outreach that lacks personalization and proof", () => {
    const critique = buildCritique({
      brand: brand(),
      asset: asset({
        channel: "outbound",
        approvalStage: "WAITING_FOR_SEND_APPROVAL",
        body: "We can help with your setup. Book a call.\n\nClaims: claim-1",
        metadata: {
          appliedQualifiers: ["persistent memory"],
          accountName: "Acme AI",
          personName: "Jane",
          playbookType: "benchmark_proof_push",
          signalSource: "docs",
          painKeywords: ["context", "docs"],
        },
      }),
      claims: [claim()],
    });

    expect(critique.warnings.some((warning) => warning.includes("Personalization is weak"))).toBe(true);
    expect(critique.warnings.some((warning) => warning.includes("proof anchor"))).toBe(true);
    expect(critique.score).toBeLessThan(90);
  });
});
