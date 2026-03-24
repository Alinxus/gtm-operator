import { z } from "zod";
import type {
  Brand,
  ChannelType,
  Claim,
  Opportunity,
  ProspectAccount,
  ProspectPerson,
  Signal,
  Workspace,
} from "./domain.js";
import type { LanguageModelProvider } from "./llm.js";
import type { ExternalResearchDocument } from "./research-connectors.js";
import type { RetainDbFitAnalysis } from "./retaindb-intelligence.js";

const researchPackSchema = z.object({
  accountSummary: z.string().min(1),
  painSignals: z.array(z.string()).default([]),
  proofHooks: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  recommendedChannels: z.array(z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"])).default([]),
  nextActionReason: z.string().min(1),
});

const generatedStepSchema = z.object({
  steps: z
    .array(
      z.object({
        channel: z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"]),
        title: z.string().min(1),
        body: z.string().min(1),
        CTA: z.string().min(1),
        claimIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(6),
});

export type OperatorResearchPack = z.infer<typeof researchPackSchema>;
export type ModelGeneratedSequence = z.infer<typeof generatedStepSchema>;

function lines(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function claimList(claims: Claim[]) {
  return claims
    .map((claim) => {
      const qualifiers = claim.requiredQualifiers.length > 0 ? ` | qualifiers: ${claim.requiredQualifiers.join(", ")}` : "";
      return `- ${claim.id}: ${claim.text}${qualifiers}`;
    })
    .join("\n");
}

function documentList(documents: ExternalResearchDocument[]) {
  return documents
    .map((document) => `- [${document.source}] ${document.title}${document.url ? ` | ${document.url}` : ""}\n  ${document.excerpt}`)
    .join("\n");
}

export async function runOperatorResearchWorker(input: {
  llm: LanguageModelProvider;
  brand: Brand;
  workspace: Workspace;
  account: ProspectAccount;
  person: ProspectPerson | null;
  signal: Signal;
  claims: Claim[];
  memoryHits: string[];
  documents: ExternalResearchDocument[];
  fitAnalysis: RetainDbFitAnalysis;
}) {
  if (!input.llm.enabled) return null;

  const allowedChannels = [...new Set<ChannelType>(["outbound", "reply", "social", "community", "landing", "seo", "partnership"])];
  return input.llm.generateObject({
    schema: researchPackSchema,
    system: [
      "You are the RetainDB GTM research worker.",
      "Be direct, proof-first, and builder-native.",
      "Use only the provided evidence. Do not invent facts.",
      "Return concise JSON only.",
    ].join("\n"),
    prompt: [
      `Brand tone: ${input.brand.voice.tone}`,
      `Workspace ICP: ${input.workspace.primaryIcp}`,
      `Account: ${input.account.name}`,
      `Person: ${input.person ? `${input.person.name} (${input.person.role})` : "unknown"}`,
      `Signal title: ${input.signal.title}`,
      `Signal content: ${input.signal.content}`,
      "",
      "Approved proof handles:",
      claimList(input.claims),
      "",
      "External documents:",
      documentList(input.documents),
      "",
      "RetainDB fit analysis:",
      JSON.stringify(input.fitAnalysis, null, 2),
      "",
      "Memory hits:",
      lines(input.memoryHits),
      "",
      `Allowed channels: ${allowedChannels.join(", ")}`,
      "",
      "Return JSON with:",
      "- accountSummary: one tight summary of the account, the moment, and the pain.",
      "- painSignals: repeated pains we should answer directly.",
      "- proofHooks: which proof points from the claim list matter most here.",
      "- objections: likely objections from this signal and evidence.",
      "- recommendedChannels: channels from the allowed list only.",
      "- nextActionReason: one sentence on why now.",
    ].join("\n"),
    temperature: 0.2,
    maxOutputTokens: 1200,
  });
}

const icpScoringSchema = z.object({
  score: z.number().min(0).max(100),
  fitTier: z.enum(["hot", "warm", "cold"]),
  painMatch: z.number().min(0).max(1),
  buyingSignal: z.number().min(0).max(1),
  proofReadiness: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1).max(5),
  disqualifiers: z.array(z.string()).default([]),
  recommendedAngle: z.string().min(1),
});

export type IcpScoringResult = z.infer<typeof icpScoringSchema>;

export async function runIcpScoringWorker(input: {
  llm: LanguageModelProvider;
  workspace: Workspace;
  account: ProspectAccount;
  signal: { title: string; content: string; source: string };
  icp: string;
  documents: ExternalResearchDocument[];
}): Promise<IcpScoringResult | null> {
  if (!input.llm.enabled) return null;

  const raw = await input.llm.generateObject({
    schema: icpScoringSchema,
    system: [
      `You are an expert GTM analyst for ${input.workspace.name ?? "a B2B startup"}.`,
      "Your job is to score how well a prospect signal matches the ideal customer profile.",
      "Be honest and precise. Do not inflate scores. A cold lead is cold.",
      "Return JSON only.",
    ].join("\n"),
    prompt: [
      `ICP definition: ${input.icp}`,
      "",
      `Account: ${input.account.name}`,
      input.account.summary ? `Account summary: ${input.account.summary}` : "",
      `Signal source: ${input.signal.source}`,
      `Signal title: ${input.signal.title}`,
      `Signal content (truncated to 800 chars): ${input.signal.content.slice(0, 800)}`,
      "",
      input.documents.length > 0
        ? ["Supporting documents:", documentList(input.documents.slice(0, 4))].join("\n")
        : "",
      "",
      "Score this account/signal against the ICP. Return:",
      "- score: 0-100 overall ICP fit (70+ = worth outreach, 85+ = prioritize now)",
      "- fitTier: hot (85+), warm (55-84), cold (<55)",
      "- painMatch: 0-1, does the signal show they have the pain the product solves?",
      "- buyingSignal: 0-1, are there buying intent signals (evaluating, pricing, demo request)?",
      "- proofReadiness: 0-1, would a proof/benchmark resonate with this account?",
      "- reasons: up to 5 short bullet points explaining the score",
      "- disqualifiers: reasons this might NOT be a fit (empty array if none)",
      "- recommendedAngle: one sentence on the best opening angle for outreach",
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: 0.1,
    maxOutputTokens: 600,
  });
  return { ...raw, disqualifiers: raw.disqualifiers ?? [] } satisfies IcpScoringResult;
}

export async function runOperatorSequenceWorker(input: {
  llm: LanguageModelProvider;
  brand: Brand;
  workspace: Workspace;
  account: ProspectAccount;
  person: ProspectPerson | null;
  signal: Signal;
  opportunity: Opportunity;
  claims: Claim[];
  researchPack: OperatorResearchPack | null;
  fitAnalysis: RetainDbFitAnalysis;
}) {
  if (!input.llm.enabled) return null;

  return input.llm.generateObject({
    schema: generatedStepSchema,
    system: [
      "You are the RetainDB GTM sequence worker.",
      "Write sharp, builder-native outreach and distribution assets.",
      "Use short lines when possible. Lead with pain, then mechanism, then proof.",
      "Use only the approved claims provided.",
      "Every step must cite valid claimIds from the list.",
      "Do not use hype, fluff, or unsupported claims.",
      "Return JSON only.",
    ].join("\n"),
    prompt: [
      `Brand tone: ${input.brand.voice.tone}`,
      `Preferred phrases: ${input.brand.voice.preferredPhrases.join(", ")}`,
      `Forbidden phrases: ${input.brand.voice.forbiddenPhrases.join(", ")}`,
      `Workspace ICP: ${input.workspace.primaryIcp}`,
      `Account: ${input.account.name}`,
      `Account summary: ${input.account.summary}`,
      `Person: ${input.person ? `${input.person.name} (${input.person.role})` : "unknown"}`,
      `Signal title: ${input.signal.title}`,
      `Signal content: ${input.signal.content}`,
      `Opportunity reason: ${input.opportunity.reason}`,
      `Recommended playbook: ${input.opportunity.recommendedPlaybook}`,
      `Allowed channels: ${input.opportunity.reachableChannels.join(", ")}`,
      "",
      "RetainDB fit analysis:",
      JSON.stringify(input.fitAnalysis, null, 2),
      "",
      "Approved claims:",
      claimList(input.claims),
      "",
      "Research pack:",
      input.researchPack
        ? JSON.stringify(input.researchPack, null, 2)
        : '{"accountSummary":"Use the signal only.","painSignals":[],"proofHooks":[],"objections":[],"recommendedChannels":[],"nextActionReason":"Move fast on the signal."}',
      "",
      "Return JSON with steps. Requirements:",
      "- 3 to 5 steps total.",
      "- Only use channels from the allowed list, but always include one landing step.",
      "- Prefer outbound, reply, social, community, and landing before seo.",
      "- Make each step feel specific to the account or signal.",
      "- Keep body copy ready for human review.",
      "- CTA should be direct and realistic.",
      "- claimIds must be a subset of the approved claims.",
    ].join("\n"),
    temperature: 0.35,
    maxOutputTokens: 1800,
  });
}

// ---------------------------------------------------------------------------
// Content distribution worker — generates ready-to-post social content
// ---------------------------------------------------------------------------

const xThreadSchema = z.object({
  tweets: z.array(z.string().max(280)).min(2).max(10),
  hashtags: z.array(z.string()).optional().transform((v): string[] => v ?? []),
});

const redditPostSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1),
  suggestedSubreddits: z.array(z.string()).min(1).max(5),
});

const newsletterPitchSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  targetNewsletter: z.string().optional(),
});

export type XThreadDraft = z.infer<typeof xThreadSchema>;
export type RedditPostDraft = z.infer<typeof redditPostSchema>;
export type NewsletterPitchDraft = z.infer<typeof newsletterPitchSchema>;

export async function runContentDistributionWorker(input: {
  llm: LanguageModelProvider;
  brand: Brand;
  workspace: Workspace;
  claims: Claim[];
  topic: string;
  context?: string;
  platform: "x_thread" | "reddit_post" | "newsletter_pitch";
}): Promise<Record<string, unknown> | null> {
  if (!input.llm.enabled) return null;

  const claimsText = claimList(input.claims.slice(0, 8));
  const baseSystem = [
    `You are a founder writing as ${input.brand.name}.`,
    `Tone: ${input.brand.voice.tone}`,
    `Preferred phrases: ${input.brand.voice.preferredPhrases.join(", ")}`,
    `Forbidden phrases: ${input.brand.voice.forbiddenPhrases.join(", ")}`,
    "Write in first person. Be direct. No hype. Use only approved proof claims.",
    "Return JSON only.",
  ].join("\n");

  if (input.platform === "x_thread") {
    return input.llm.generateObject({
      schema: xThreadSchema,
      system: baseSystem,
      prompt: [
        `Topic: ${input.topic}`,
        input.context ? `Context: ${input.context}` : "",
        "",
        "Approved proof claims:",
        claimsText,
        "",
        "Write a Twitter/X thread. Requirements:",
        "- 3-7 tweets",
        "- Each tweet ≤ 280 characters",
        "- First tweet is the hook — make it worth clicking",
        "- Reference at least one proof claim with a real number or benchmark",
        "- End with a clear CTA (try it, link, reply)",
        "- No em dashes. No buzzwords. Avoid 'unlock', 'leverage', 'seamless'.",
        "- Return: { tweets: string[], hashtags: string[] }",
      ].filter(Boolean).join("\n"),
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
  }

  if (input.platform === "reddit_post") {
    return input.llm.generateObject({
      schema: redditPostSchema,
      system: baseSystem,
      prompt: [
        `Topic: ${input.topic}`,
        input.context ? `Context: ${input.context}` : "",
        "",
        "Approved proof claims:",
        claimsText,
        "",
        "Write a Reddit post. Requirements:",
        "- Title: factual, specific, no clickbait",
        "- Body: helpful first, product mention natural (not spammy)",
        "- Use markdown formatting (code blocks if relevant)",
        "- Include at least one concrete result or benchmark",
        "- Suggest 2-4 relevant subreddits from: MachineLearning, LangChain, LocalLLaMA, programming, startups, SideProject, learnmachinelearning",
        "- Return: { title, body, suggestedSubreddits: string[] }",
      ].filter(Boolean).join("\n"),
      temperature: 0.4,
      maxOutputTokens: 1200,
    });
  }

  // newsletter_pitch
  return input.llm.generateObject({
    schema: newsletterPitchSchema,
    system: baseSystem,
    prompt: [
      `Topic: ${input.topic}`,
      input.context ? `Context: ${input.context}` : "",
      "",
      "Approved proof claims:",
      claimsText,
      "",
      "Write a newsletter pitch email to a technical newsletter author. Requirements:",
      "- Short subject line (< 60 chars)",
      "- Body < 200 words",
      "- Lead with why their readers would care",
      "- Include one specific proof point or benchmark",
      "- Offer a guest post angle or exclusive data",
      "- Return: { subject, body, targetNewsletter? }",
    ].filter(Boolean).join("\n"),
    temperature: 0.4,
    maxOutputTokens: 600,
  });
}

// ---------------------------------------------------------------------------
// HN-specific draft (plain text comment, no markdown headers, conversational)
// ---------------------------------------------------------------------------

const hnCommentSchema = z.object({
  comment: z.string().min(1),
  threadRelevanceReason: z.string().min(1),
  postManually: z.literal(true),
});

export type HnCommentDraft = z.infer<typeof hnCommentSchema>;

export async function runHnCommentWorker(input: {
  llm: LanguageModelProvider;
  brand: Brand;
  threadTitle: string;
  threadContent: string;
  threadUrl: string;
  claims: Claim[];
}): Promise<HnCommentDraft | null> {
  if (!input.llm.enabled) return null;

  return input.llm.generateObject({
    schema: hnCommentSchema,
    system: [
      "You write Hacker News comments on behalf of a founder.",
      "HN style: direct, technical, no marketing speak, no exclamation marks.",
      "Mention the product only if it genuinely adds value to the discussion.",
      "If it doesn't fit naturally, don't force it.",
      "Return JSON only.",
    ].join("\n"),
    prompt: [
      `Thread: ${input.threadTitle}`,
      `Thread URL: ${input.threadUrl}`,
      `Thread excerpt: ${input.threadContent.slice(0, 600)}`,
      "",
      `Our product: ${input.brand.name}`,
      "Approved proof claims:",
      claimList(input.claims.slice(0, 5)),
      "",
      "Write a HN comment. Requirements:",
      "- Plain text only, no markdown headers or bold",
      "- Address the actual question or discussion point first",
      "- Mention the product by name only if directly relevant",
      "- Max 3 paragraphs",
      "- Also return: threadRelevanceReason (why we're commenting) and postManually: true",
    ].join("\n"),
    temperature: 0.3,
    maxOutputTokens: 500,
  });
}
