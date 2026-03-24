import { describe, expect, it } from "vitest";
import { analyzeRetainDbFit } from "../src/retaindb-intelligence.js";
import { retainedbTruthPack } from "../src/seed/retaindb-truth-pack.js";

describe("retaindb intelligence", () => {
  const claims = retainedbTruthPack.claims.map((claim) => ({
    ...claim,
    brandId: "brand_test",
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:00.000Z",
  }));

  it("classifies grounded docs pain and finds a proof path", () => {
    const fit = analyzeRetainDbFit({
      title: "Founder wants grounded answers from docs",
      content:
        "We are shipping an AI support assistant. It keeps hallucinating, answers from stale docs, and we need something that works with our existing stack without a rewrite.",
      source: "docs",
      accountName: "Orbit AI",
      role: "Founder",
      claims,
    });

    expect(fit.primaryPainId).toBe("grounded_docs");
    expect(fit.matchedProofClaimIds).toContain("retainedb-grounded-docs-zero-hallucination");
    expect(fit.qualificationScore).toBeGreaterThanOrEqual(40);
    expect(fit.outcomeAngles.length).toBeGreaterThan(0);
  });

  it("spots preference-memory fit for returning-user products", () => {
    const fit = analyzeRetainDbFit({
      title: "Users keep repeating their preferences",
      content:
        "Our AI product forgets user preferences between sessions. Returning users have to re-explain style, likes, and dislikes every time.",
      source: "x",
      accountName: "Acme AI",
      role: "Founder",
      claims,
    });

    expect(fit.primaryPainId).toBe("user_preference_memory");
    expect(fit.matchedProofClaimIds).toContain("retainedb-preference-recall-88");
    expect(fit.painScore).toBeGreaterThan(0);
  });
});
