import { describe, expect, it } from "vitest";
import { buildClaimIndex, validateClaimUsage } from "../src/claims.js";
import type { Claim } from "../src/domain.js";

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim-1",
    brandId: "brand-1",
    category: "feature",
    status: "verified",
    text: "RetainDB exposes a canonical memory API.",
    sourceUrls: ["https://context.retaindb.com/docs"],
    sourceExcerpt: "Canonical memory API.",
    requiredQualifiers: ["canonical"],
    allowedChannels: ["social", "seo"],
    forbiddenVariants: ["best memory system in the world"],
    owner: "product",
    metadata: {},
    lastVerifiedAt: "2026-03-22T00:00:00.000Z",
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("claim validation", () => {
  it("accepts supported claims when qualifiers are present", () => {
    const claim = makeClaim();
    const result = validateClaimUsage({
      claimIds: [claim.id],
      claimIndex: buildClaimIndex([claim]),
      channel: "social",
      appliedQualifiers: ["canonical"],
      body: `${claim.text}\n\nClaims: ${claim.id}`,
    });

    expect(result.usableClaims).toHaveLength(1);
    expect(result.blockedClaims).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it("blocks unknown claims and forbidden variants", () => {
    const claim = makeClaim({
      forbiddenVariants: ["magic memory"],
      sourceUrls: ["https://context.retaindb.com/docs"],
    });
    const result = validateClaimUsage({
      claimIds: ["missing-claim", claim.id],
      claimIndex: buildClaimIndex([claim]),
      channel: "social",
      appliedQualifiers: ["canonical"],
      body: `This is magic memory.\n\nClaims: ${claim.id}`,
    });

    expect(result.blockedClaims).toHaveLength(1);
    expect(result.issues.some((issue) => issue.blocking)).toBe(true);
  });
});
