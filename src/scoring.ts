import type { Asset, Brand, Claim, Critique } from "./domain.js";
import { approvalStageForAsset } from "./state-machine.js";
import { buildClaimIndex, validateClaimUsage } from "./claims.js";
import { createId, isoNow } from "./domain.js";

const FLUFF_PHRASES = [
  "game-changing",
  "revolutionary",
  "best-in-class",
  "next-gen",
  "magic",
  "unlock",
  "synergy",
  "cutting edge",
  "world class",
];

const CTA_PHRASES = [
  "reply",
  "book",
  "try",
  "read",
  "learn",
  "join",
  "download",
  "reach out",
  "dm",
  "get started",
  "see the full",
];

const PAIN_PHRASES = ["memory", "context", "docs", "hallucination", "preferences", "grounded", "recall"];
const PROOF_PHRASES = [
  "88%",
  "79%",
  "0%",
  "three calls",
  "persistent memory",
  "grounded docs",
  "works with any llm",
  "zero rearchitecting",
  "numbers you can hold us to",
  "proof pack",
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(text: string) {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function jaccard(a: string, b: string) {
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function hasAny(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase.toLowerCase()));
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function hasNumericProof(text: string) {
  return /\b\d+(?:\.\d+)?%/.test(text) || /\bsub-?\d+ms\b/i.test(text);
}

function channelLengthLimits(channel: Asset["channel"]) {
  if (channel === "social" || channel === "reply" || channel === "community") {
    return { maxChars: 900, minChars: 60 };
  }
  if (channel === "outbound" || channel === "partnership") {
    return { maxChars: 1800, minChars: 120 };
  }
  return { maxChars: 4000, minChars: 250 };
}

export interface CritiqueInput {
  asset: Asset;
  brand: Brand;
  claims: Claim[];
  peerAssets?: Asset[];
}

export interface CritiqueEvaluation {
  score: number;
  blockingIssues: string[];
  warnings: string[];
  notes: string[];
}

export function evaluateAsset(input: CritiqueInput): CritiqueEvaluation {
  const claimIndex = buildClaimIndex(input.claims);
  const appliedQualifiers = (input.asset.metadata.appliedQualifiers as string[] | undefined) ?? [];
  const validation = validateClaimUsage({
    claimIds: input.asset.claimIds,
    claimIndex,
    channel: input.asset.channel,
    appliedQualifiers,
    body: input.asset.body,
  });

  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const metadata = input.asset.metadata ?? {};
  let score = 100;

  for (const issue of validation.issues) {
    if (issue.blocking) {
      blockingIssues.push(`${issue.claimId}: ${issue.message}`);
      score -= 35;
    }
  }

  if (validation.usableClaims.length === 0) {
    blockingIssues.push("No usable claims remain after validation.");
    score -= 30;
  } else {
    notes.push(`Validated ${validation.usableClaims.length} claim(s).`);
  }

  if (hasAny(input.asset.title, input.brand.voice.forbiddenPhrases) || hasAny(input.asset.body, input.brand.voice.forbiddenPhrases)) {
    blockingIssues.push("Contains brand-forbidden phrasing.");
    score -= 30;
  }

  for (const phrase of FLUFF_PHRASES) {
    if (input.asset.body.toLowerCase().includes(phrase)) {
      warnings.push(`Contains fluff phrase: ${phrase}.`);
      score -= 8;
    }
  }

  if (!hasAny(input.asset.body, CTA_PHRASES)) {
    if (input.asset.channel === "outbound" || input.asset.channel === "partnership" || input.asset.channel === "landing" || input.asset.channel === "seo") {
      blockingIssues.push("Missing a clear CTA.");
      score -= 25;
    } else {
      warnings.push("CTA is weak or implicit.");
      score -= 10;
    }
  }

  const { maxChars, minChars } = channelLengthLimits(input.asset.channel);
  if (input.asset.body.length > maxChars) {
    warnings.push(`Asset is long for ${input.asset.channel}.`);
    score -= 8;
  }
  if (input.asset.body.length < minChars) {
    warnings.push(`Asset is short for ${input.asset.channel}.`);
    score -= 8;
  }

  const accountName = stringMetadata(metadata, "accountName");
  const personName = stringMetadata(metadata, "personName");
  const playbookType = stringMetadata(metadata, "playbookType");
  const signalSource = stringMetadata(metadata, "signalSource");
  const painKeywords = stringArrayMetadata(metadata, "painKeywords");
  const personalized =
    (accountName && hasAny(`${input.asset.title}\n${input.asset.body}`, [accountName])) ||
    (personName && hasAny(`${input.asset.title}\n${input.asset.body}`, [personName]));

  if ((input.asset.channel === "outbound" || input.asset.channel === "reply" || input.asset.channel === "partnership") && (accountName || personName)) {
    if (personalized) {
      notes.push("Uses account-specific context.");
    } else {
      warnings.push("Personalization is weak for a targeted outreach touch.");
      score -= 10;
    }
  }

  if (painKeywords.length > 0) {
    if (hasAny(input.asset.body, painKeywords)) {
      notes.push("Addresses the detected pain signal.");
    } else {
      warnings.push("Does not clearly address the detected pain signal.");
      score -= 8;
    }
  } else if (
    (input.asset.channel === "outbound" || input.asset.channel === "reply" || input.asset.channel === "landing") &&
    !hasAny(input.asset.body, PAIN_PHRASES)
  ) {
    warnings.push("Pain alignment could be sharper.");
    score -= 6;
  }

  const proofAnchored =
    input.asset.claimIds.length >= 2 || hasAny(input.asset.body, PROOF_PHRASES) || hasNumericProof(input.asset.body);
  if (proofAnchored) {
    notes.push("Leads with concrete proof.");
  } else if (playbookType === "benchmark_proof_push") {
    warnings.push("Benchmark-led playbook is missing a strong proof anchor.");
    score -= 12;
  } else if (input.asset.channel === "outbound" || input.asset.channel === "landing" || input.asset.channel === "reply") {
    warnings.push("Could use a sharper proof anchor.");
    score -= 6;
  }

  if (
    input.brand.voice.preferredPhrases.length > 0 &&
    hasAny(`${input.asset.title}\n${input.asset.body}`, input.brand.voice.preferredPhrases)
  ) {
    notes.push("Matches approved brand phrasing.");
  } else if (input.asset.channel !== "seo") {
    warnings.push("Voice fit could be closer to approved brand phrasing.");
    score -= 4;
  }

  if (
    (signalSource === "form" || signalSource === "docs" || signalSource === "product") &&
    !hasAny(input.asset.body, ["book a call", "book", "send", "proof pack", "reply"])
  ) {
    warnings.push("High-intent signal should get a more direct next step.");
    score -= 8;
  }

  if ((input.asset.channel === "social" || input.asset.channel === "reply") && input.asset.body.split(/\n\s*\n/).length < 2) {
    warnings.push("Could hit harder with shorter, more contrastive lines.");
    score -= 4;
  }

  if (input.peerAssets && input.peerAssets.length > 0) {
    for (const peer of input.peerAssets) {
      if (peer.id === input.asset.id) continue;
      if (jaccard(peer.title + " " + peer.body, input.asset.title + " " + input.asset.body) > 0.84) {
        warnings.push(`Feels too similar to asset ${peer.id}.`);
        score -= 10;
        break;
      }
    }
  }

  if (input.asset.approvalStage !== approvalStageForAsset(input.asset.channel)) {
    warnings.push("Approval stage and channel do not match the policy map.");
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    blockingIssues,
    warnings,
    notes,
  };
}

export function buildCritique(input: CritiqueInput): Critique {
  const evaluation = evaluateAsset(input);
  return {
    id: createId("critique"),
    brandId: input.brand.id,
    campaignId: input.asset.campaignId,
    runId: input.asset.runId,
    assetId: input.asset.id,
    score: evaluation.score,
    blockingIssues: evaluation.blockingIssues,
    warnings: evaluation.warnings,
    notes: evaluation.notes,
    reviewer: "critic-worker",
    createdAt: isoNow(),
  };
}
