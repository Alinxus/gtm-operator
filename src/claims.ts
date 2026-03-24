import type { ChannelType, Claim } from "./domain.js";
import { CLAIM_STATUSES, dedupe } from "./domain.js";

export interface ClaimValidationIssue {
  claimId: string;
  message: string;
  blocking: boolean;
}

export interface ClaimValidationResult {
  usableClaims: Claim[];
  blockedClaims: Claim[];
  issues: ClaimValidationIssue[];
  requiredQualifiers: string[];
}

const BLOCKED_STATUSES = new Set<Claim["status"]>(["deprecated", "disputed", "forbidden"]);

export function buildClaimIndex(claims: Claim[]) {
  return new Map(claims.map((claim) => [claim.id, claim] as const));
}

export function canUseClaimOnChannel(claim: Claim, channel: ChannelType) {
  return claim.allowedChannels.includes(channel) && !BLOCKED_STATUSES.has(claim.status);
}

export function validateClaimUsage(input: {
  claimIds: string[];
  claimIndex: Map<string, Claim>;
  channel: ChannelType;
  appliedQualifiers?: string[];
  body?: string;
}): ClaimValidationResult {
  const appliedQualifiers = new Set(input.appliedQualifiers ?? []);
  const lowerBody = (input.body ?? "").toLowerCase();
  const usableClaims: Claim[] = [];
  const blockedClaims: Claim[] = [];
  const issues: ClaimValidationIssue[] = [];
  const requiredQualifiers: string[] = [];

  if (input.claimIds.length === 0) {
    issues.push({
      claimId: "missing",
      message: "Asset must cite at least one claim id.",
      blocking: true,
    });
  }

  for (const claimId of dedupe(input.claimIds)) {
    const claim = input.claimIndex.get(claimId);
    if (!claim) {
      issues.push({
        claimId,
        message: "Unknown claim id.",
        blocking: true,
      });
      continue;
    }

    requiredQualifiers.push(...claim.requiredQualifiers);

    if (!canUseClaimOnChannel(claim, input.channel)) {
      blockedClaims.push(claim);
      issues.push({
        claimId,
        message: `Claim status ${claim.status} cannot be used on ${input.channel}.`,
        blocking: true,
      });
      continue;
    }

    const missingQualifiers = claim.requiredQualifiers.filter((qualifier) => {
      const normalized = qualifier.toLowerCase();
      return !appliedQualifiers.has(normalized) && !lowerBody.includes(normalized);
    });

    if (missingQualifiers.length > 0) {
      blockedClaims.push(claim);
      issues.push({
        claimId,
        message: `Missing required qualifiers: ${missingQualifiers.join(", ")}.`,
        blocking: true,
      });
      continue;
    }

    const forbiddenVariant = claim.forbiddenVariants.find((variant) => {
      const normalized = variant.toLowerCase();
      return normalized.length > 0 && lowerBody.includes(normalized);
    });

    if (forbiddenVariant) {
      blockedClaims.push(claim);
      issues.push({
        claimId,
        message: `Contains forbidden claim variant: ${forbiddenVariant}.`,
        blocking: true,
      });
      continue;
    }

    usableClaims.push(claim);
  }

  return {
    usableClaims,
    blockedClaims,
    issues,
    requiredQualifiers: dedupe(requiredQualifiers),
  };
}

export function claimStatuses(): Claim["status"][] {
  return [...CLAIM_STATUSES];
}
