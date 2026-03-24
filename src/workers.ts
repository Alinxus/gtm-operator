import type {
  AssetDraft,
  Brand,
  Campaign,
  ChannelType,
  Claim,
  MemoryProvider,
  MarketResearch,
  MemoryWrite,
  MessageHouse,
  Outcome,
  PersonaInsight,
  PositioningPlan,
  Run,
  TruthPack,
} from "./domain.js";
import { approvalStageForAsset } from "./state-machine.js";
import { buildClaimIndex, validateClaimUsage } from "./claims.js";
import { scopeToMemoryType } from "./memory.js";
import { buildCritique } from "./scoring.js";

export interface GroundingResult {
  approvedClaims: Claim[];
  blockedClaims: Claim[];
  forbiddenClaims: string[];
  proofPoints: string[];
}

export function groundTruthWorker(input: {
  brand: Brand;
  campaign: Campaign;
  claims: Claim[];
  truthPack?: TruthPack;
}): GroundingResult {
  const claimIndex = buildClaimIndex(input.claims);
  const campaignChannels: ChannelType[] =
    input.campaign.channels.length > 0 ? input.campaign.channels : ["social"];
  const approvedClaims: Claim[] = [];
  const blockedClaims: Claim[] = [];
  const proofPoints: string[] = [];
  const forbiddenClaims = input.truthPack?.forbiddenClaims ?? [];

  for (const claim of input.claims) {
    const usableOnAnyRequestedChannel = campaignChannels.some((channel) => {
      const validation = validateClaimUsage({
        claimIds: [claim.id],
        claimIndex,
        channel,
        appliedQualifiers: claim.requiredQualifiers.map((qualifier) => qualifier.toLowerCase()),
        body: claim.text,
      });
      return validation.usableClaims.length > 0;
    });

    if (usableOnAnyRequestedChannel) {
      approvedClaims.push(claim);
      proofPoints.push(claim.text);
    } else {
      blockedClaims.push(claim);
    }
  }

  return {
    approvedClaims,
    blockedClaims,
    forbiddenClaims,
    proofPoints,
  };
}

const PERSONA_LIBRARY: Record<string, PersonaInsight> = {
  ai_founder: {
    persona: "AI founder",
    pains: ["Users repeat themselves every session", "The product story feels hand-wavy without proof"],
    objections: ["We can build this ourselves", "Benchmarks do not reflect production", "Memory is a nice-to-have"],
    desiredOutcomes: ["Persistent user context", "Proof that stands up in public", "Faster shipping without a rewrite"],
    channels: ["social", "outbound", "community", "seo", "landing"],
  },
  infra_engineer: {
    persona: "Infra engineer",
    pains: ["Latency budgets are tight", "Brittle retrieval stacks are hard to operate", "Grounding needs to be explicit"],
    objections: ["This sounds like another wrapper", "How is this different from a vector DB?"],
    desiredOutcomes: ["Clear integration paths", "Low latency", "Grounded responses that are easier to trust"],
    channels: ["seo", "community", "reply", "landing"],
  },
  agent_builder: {
    persona: "Agent builder",
    pains: ["Agents forget prior sessions", "Prompt-only memory gets messy fast", "Docs drift away from responses"],
    objections: ["Will this fit my stack?", "Can I trust the memory layer?"],
    desiredOutcomes: ["Persistent recall", "Grounded docs", "Simple integration"],
    channels: ["social", "community", "reply", "seo"],
  },
  open_source_maintainer: {
    persona: "Open-source maintainer",
    pains: ["Contributors need current docs and decisions", "Trust drops fast when assistants hallucinate"],
    objections: ["Does this lock me in?", "Will it stay portable?"],
    desiredOutcomes: ["Portable architecture", "Clear docs", "A technical story contributors can believe"],
    channels: ["community", "social", "seo", "partnership"],
  },
  product_marketing: {
    persona: "Product marketing",
    pains: ["Positioning gets abstract too quickly", "Teams need proof-led messaging they can reuse"],
    objections: ["Will this stay concrete?", "Will builders buy the story?"],
    desiredOutcomes: ["Sharper hooks", "Credible proof", "Reusable campaign structure"],
    channels: ["landing", "seo", "social", "outbound"],
  },
  partner: {
    persona: "Partner",
    pains: ["The joint story is muddy", "Integration value is hard to explain quickly"],
    objections: ["Is this worth a partnership motion?", "Will the technical fit be clear?"],
    desiredOutcomes: ["A clean integration story", "Proof-led co-marketing", "Clear next steps"],
    channels: ["outbound", "partnership", "social"],
  },
};

function matchPersona(name: string): PersonaInsight {
  const lower = name.toLowerCase();
  if (lower.includes("founder")) return PERSONA_LIBRARY.ai_founder;
  if (lower.includes("infra") || lower.includes("engineer")) return PERSONA_LIBRARY.infra_engineer;
  if (lower.includes("agent")) return PERSONA_LIBRARY.agent_builder;
  if (lower.includes("maintainer") || lower.includes("open source")) return PERSONA_LIBRARY.open_source_maintainer;
  if (lower.includes("marketing")) return PERSONA_LIBRARY.product_marketing;
  if (lower.includes("partner")) return PERSONA_LIBRARY.partner;
  return PERSONA_LIBRARY.agent_builder;
}

function buildResearchFromMemory(memorySnippets: string[]) {
  const deduped = [...new Set(memorySnippets.map((snippet) => snippet.trim()).filter(Boolean))];
  return deduped.slice(0, 5);
}

function defaultCompetitorSnapshot() {
  return [
    "DIY memory stacks that turn into prompt glue and brittle retrieval logic.",
    "Vector databases that store chunks but still leave builders stitching together memory behavior by hand.",
    "Agent stacks that promise context but still answer from guesses instead of source truth.",
  ];
}

export async function marketResearchWorker(input: {
  brand: Brand;
  campaign: Campaign;
  approvedClaims: Claim[];
  memoryProvider: MemoryProvider;
}): Promise<MarketResearch> {
  const personas = input.campaign.targetPersonas.length > 0 ? input.campaign.targetPersonas : ["AI founder"];
  const matchedPersonas = personas.map((persona) => matchPersona(persona));
  const briefQuery = input.campaign.brief.slice(0, 160);

  const [brandMemory, marketMemory] = await Promise.all([
    input.memoryProvider.search({
      query: briefQuery,
      project: input.brand.memoryProject,
      namespace: `brand:${input.brand.slug}`,
      memoryTypes: ["instruction", "preference"],
      limit: 5,
    }),
    input.memoryProvider.search({
      query: briefQuery,
      project: input.brand.memoryProject,
      namespace: `market:${input.brand.slug}`,
      memoryTypes: ["factual", "event"],
      limit: 5,
    }),
  ]);

  const competitorSnapshot = [
    ...defaultCompetitorSnapshot(),
    ...buildResearchFromMemory(marketMemory.map((item) => item.content)),
  ];

  const marketObjections = Array.from(
    new Set([
      ...matchedPersonas.flatMap((persona) => persona.objections),
      ...buildResearchFromMemory(brandMemory.map((item) => item.content)),
    ]),
  );

  const opportunities = Array.from(
    new Set([
      "Launch proof-led posts that open with the problem, then the mechanism, then the numbers.",
      "Reply to builders asking about memory, retrieval, or grounded docs with sharp before-versus-after framing.",
      "Send founder-style outbound notes that emphasize three calls, any LLM, and zero rearchitecting.",
      "Publish SEO briefs around persistent memory, grounded docs, and memory infrastructure for AI products.",
      "Use community posts to bridge the public story and the deeper SDK, MCP, and memory-model details.",
    ]),
  );

  const channelPriorities =
    input.campaign.channels.length > 0 ? input.campaign.channels : (["social", "community", "outbound", "seo"] as ChannelType[]);

  const contentAngles = Array.from(
    new Set([
      "Your AI forgets everything. Persistent memory fixes that.",
      "Answers from your docs, not model guesses.",
      "Three calls to add memory without a rewrite.",
      "Measured proof beats hand-wavy AI marketing.",
      ...input.approvedClaims.slice(0, 3).map((claim) => claim.text),
    ]),
  );

  return {
    personas: matchedPersonas,
    competitorSnapshot,
    marketObjections,
    opportunities,
    channelPriorities,
    contentAngles,
  };
}

function personaAngle(persona: string) {
  const lower = persona.toLowerCase();
  if (lower.includes("founder")) return "Persistent memory your team can ship without a rewrite.";
  if (lower.includes("engineer") || lower.includes("infra")) return "Grounded docs, low latency, and integration paths that feel operationally sane.";
  if (lower.includes("maintainer")) return "Portable, technical, and concrete enough for contributors to trust.";
  if (lower.includes("marketing")) return "A proof-led story with short, concrete claims builders actually believe.";
  if (lower.includes("partner")) return "A clean memory layer that makes the shared integration story easier to tell.";
  return "Persistent memory plus grounded docs, explained in builder language.";
}

export function positioningWorker(input: {
  brand: Brand;
  campaign: Campaign;
  truth: GroundingResult;
  research: MarketResearch;
}): PositioningPlan {
  const proofClaimIds = input.truth.approvedClaims.map((claim) => claim.id);
  const proofPoints = input.truth.proofPoints.slice(0, 6);
  const objectionMap: Record<string, string> = {
    "We can build this ourselves":
      "You can glue together storage, retrieval, and prompts. The hard part is persistent memory that stays grounded, fast, and simple to ship.",
    "Benchmarks do not reflect production":
      "That is why the public story starts with measured proof and the product story shows how it fits the stack you already run.",
    "This sounds like another wrapper":
      "The value is not another wrapper. It is persistent recall, grounded docs, and integration paths like SDK, MCP, and Memory Router.",
    "How is this different from a vector DB?":
      "A vector DB stores chunks. RetainDB is built around persistent memory across sessions plus grounded retrieval before every model call.",
    "Memory is a nice-to-have":
      "If the product forgets prior sessions, preferences, and source truth, reliability turns into guesswork.",
  };

  const messageHouse: MessageHouse = {
    corePromise: `${input.brand.name} gives AI teams persistent memory that stays grounded to their docs and fits the stack they already ship.`,
    pillars: [
      "Persistent memory across sessions.",
      "Answers from your docs, not model guesses.",
      "Three calls, any LLM, zero rearchitecting.",
      "Measured proof on recall, accuracy, hallucination rate, and latency.",
      "A learning loop that keeps approved messaging reusable over time.",
    ],
    proofPoints,
    proofClaimIds,
    objectionMap,
    hookBank: [
      "Your AI forgets everything. RetainDB fixes that.",
      "Answers from your docs. Not model guesses.",
      "Three calls. Persistent memory.",
      "Works with any LLM. Zero rearchitecting.",
      "Numbers you can hold us to.",
    ],
    CTA: "Read the docs, try the API, or reply for the proof pack.",
  };

  const personaMatrix = input.research.personas.map((persona) => ({
    persona: persona.persona,
    angle: personaAngle(persona.persona),
    proofClaimIds: proofClaimIds.slice(0, 4),
    objectionsHandled: persona.objections.slice(0, 3),
  }));

  const narratives = [
    "Problem-first story: your AI forgets everything, so persistent memory becomes infrastructure.",
    "Grounding story: answers come from your docs and stored memory, not from model guesses.",
    "Integration story: three calls, any LLM, and zero rearchitecting make the product easy to try.",
  ];

  return {
    messageHouse,
    personaMatrix,
    narratives,
  };
}

function selectClaimsForChannel(channel: ChannelType, approvedClaims: Claim[]) {
  const byId = new Map(approvedClaims.map((claim) => [claim.id, claim] as const));
  const preferredIds: Record<ChannelType, string[]> = {
    social: [
      "retainedb-persistent-memory",
      "retainedb-grounded-docs",
      "retainedb-three-calls",
      "retainedb-preference-recall-88",
      "retainedb-any-llm",
      "retainedb-zero-rearchitecting",
    ],
    community: [
      "retainedb-persistent-memory",
      "retainedb-grounded-docs",
      "retainedb-any-llm",
      "retainedb-zero-rearchitecting",
      "retainedb-canonical-memory-api",
      "retainedb-memory-model",
    ],
    reply: [
      "retainedb-persistent-memory",
      "retainedb-grounded-docs",
      "retainedb-three-calls",
      "retainedb-any-llm",
    ],
    outbound: [
      "retainedb-persistent-memory",
      "retainedb-zero-rearchitecting",
      "retainedb-any-llm",
      "retainedb-preference-recall-88",
      "retainedb-sub40-p95",
    ],
    partnership: [
      "retainedb-zero-rearchitecting",
      "retainedb-any-llm",
      "retainedb-canonical-mcp-surface",
      "retainedb-canonical-memory-api",
    ],
    seo: [
      "retainedb-persistent-memory",
      "retainedb-grounded-docs",
      "retainedb-three-calls",
      "retainedb-any-llm",
      "retainedb-zero-rearchitecting",
      "retainedb-preference-recall-88",
      "retainedb-overall-accuracy-79",
      "retainedb-memory-model",
      "retainedb-tree-search",
    ],
    landing: [
      "retainedb-persistent-memory",
      "retainedb-grounded-docs",
      "retainedb-three-calls",
      "retainedb-preference-recall-88",
      "retainedb-overall-accuracy-79",
      "retainedb-grounded-docs-zero-hallucination",
      "retainedb-sub40-p95",
      "retainedb-zero-rearchitecting",
      "retainedb-any-llm",
    ],
  };

  const selected = preferredIds[channel]
    .map((id) => byId.get(id))
    .filter((claim): claim is Claim => Boolean(claim));

  return selected.length > 0 ? selected : approvedClaims.slice(0, 4);
}

function qualifiersForClaims(claims: Claim[]) {
  return [...new Set(claims.flatMap((claim) => claim.requiredQualifiers.map((qualifier) => qualifier.toLowerCase())))];
}

function personaIntro(persona: string) {
  const lower = persona.toLowerCase();
  if (lower.includes("founder")) return "If you are building an AI company,";
  if (lower.includes("engineer")) return "For infra teams shipping agents,";
  if (lower.includes("maintainer")) return "For open-source maintainers,";
  if (lower.includes("marketing")) return "For product marketing teams,";
  if (lower.includes("partner")) return "For ecosystem partners,";
  return "For agent builders,";
}

function bodyWithCitations(parts: string[], claimIds: string[]) {
  const citationLine = `Claims: ${claimIds.join(", ")}`;
  return [...parts, citationLine].join("\n\n");
}

function buildAssetDraft(input: {
  channel: ChannelType;
  persona: string;
  title: string;
  paragraphs: string[];
  claims: Claim[];
  format: string;
  angle: string;
  extraMetadata?: Record<string, unknown>;
}): AssetDraft {
  const claimIds = input.claims.map((claim) => claim.id);
  return {
    channel: input.channel,
    persona: input.persona,
    title: input.title,
    body: bodyWithCitations(input.paragraphs, claimIds),
    claimIds,
    approvalStage: approvalStageForAsset(input.channel),
    metadata: {
      format: input.format,
      appliedQualifiers: qualifiersForClaims(input.claims),
      angle: input.angle,
      ...input.extraMetadata,
    },
  };
}

export function channelGenerationWorker(input: {
  brand: Brand;
  campaign: Campaign;
  truth: GroundingResult;
  research: MarketResearch;
  positioning: PositioningPlan;
}): AssetDraft[] {
  const primaryPersona = input.research.personas[0]?.persona ?? "AI founder";
  const partnerPersona = input.research.personas.find((persona) => persona.persona.toLowerCase().includes("partner"))?.persona ?? "Partner";
  const assets: AssetDraft[] = [];

  for (const channel of input.campaign.channels) {
    const claims = selectClaimsForChannel(channel, input.truth.approvedClaims);

    switch (channel) {
      case "social":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "Social post: persistent memory with proof",
            format: "post",
            angle: input.positioning.narratives[0],
            claims: claims.slice(0, 6),
            paragraphs: [
              "Your AI forgets everything. RetainDB fixes that.",
              "Persistent memory across sessions. Answers from your docs, not model guesses. Three calls. Works with any LLM. Zero rearchitecting.",
              "Measured proof: 88% preference recall on LongMemEval. Read the docs or reply for the proof pack.",
            ],
          }),
        );
        break;
      case "community":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "Community post: memory that stays grounded",
            format: "post",
            angle: input.positioning.narratives[1],
            claims: claims.slice(0, 6),
            paragraphs: [
              "Builders usually say they want memory. What they actually want is an AI product that does not forget and does not guess.",
              "RetainDB gives persistent recall across sessions, pulls answers from your docs, and fits the stack you already ship.",
              "Under the hood there is a canonical memory API, a richer memory model, and MCP support. Read the docs if you want the implementation path.",
            ],
          }),
        );
        break;
      case "reply":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "Reply assist: why this is different",
            format: "reply",
            angle: input.positioning.narratives[2],
            claims: claims.slice(0, 4),
            paragraphs: [
              "Fair pushback. The difference is not just more retrieval.",
              "RetainDB gives persistent memory across sessions, grounded docs, and a three-call path into the product you already ship.",
              "Works with any LLM. Zero rearchitecting. Happy to send the docs or benchmark.",
            ],
          }),
        );
        break;
      case "outbound":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "Outbound note: proof-led memory layer",
            format: "email",
            angle: "Founder outreach",
            claims: claims.slice(0, 5),
            paragraphs: [
              `${personaIntro(primaryPersona)} you probably do not need another prompt wrapper.`,
              "RetainDB adds persistent memory and grounded docs without a rewrite: three calls, works with any LLM, and zero rearchitecting.",
              "There is measured proof behind it too: 88% preference recall on LongMemEval and sub-40ms p95 retrieval latency. If useful, I can send a short walkthrough.",
            ],
          }),
        );
        break;
      case "partnership":
        assets.push(
          buildAssetDraft({
            channel,
            persona: partnerPersona,
            title: "Partnership note: concrete integration story",
            format: "email",
            angle: "Co-marketing",
            claims: claims.slice(0, 4),
            paragraphs: [
              `${personaIntro(partnerPersona)} there is a clean joint story here.`,
              "RetainDB handles persistent memory, grounded docs, and drop-in integration paths through SDK, MCP, and Memory Router.",
              "That makes the pitch concrete: works with any LLM, zero rearchitecting, and numbers we can point to. Open to swapping a short integration brief?",
            ],
          }),
        );
        break;
      case "seo":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "SEO brief: persistent memory for AI agents that ship",
            format: "outline",
            angle: "Search-led education",
            claims: claims.slice(0, 8),
            paragraphs: [
              "H1: Persistent memory for AI agents that ship in production",
              "Intro: Your AI forgets everything. RetainDB gives it persistent memory across sessions and grounded docs instead of model guesses.",
              "Sections: three-call integration, works with any LLM, zero rearchitecting, measured proof, then a deeper technical section on the canonical memory API, Oracle tree search, and the seven-memory-type model.",
              "CTA: Read the docs, benchmark notes, and integration guides.",
            ],
          }),
        );
        break;
      case "landing":
        assets.push(
          buildAssetDraft({
            channel,
            persona: primaryPersona,
            title: "Landing hero: your AI should remember too",
            format: "landing",
            angle: "Homepage hero",
            claims: claims.slice(0, 9),
            paragraphs: [
              "Headline: Your AI forgets everything. RetainDB fixes that.",
              "Subhead: Persistent memory across sessions. Answers from your docs, not model guesses. Three calls. Works with any LLM. Zero rearchitecting.",
              "Proof bar: 88% preference recall on LongMemEval. 79% overall accuracy on the oracle split. 0% hallucination on grounded docs. Sub-40ms p95 retrieval latency.",
              "CTA: Try the API or read the docs.",
            ],
          }),
        );
        break;
    }
  }

  return assets;
}

export function criticWorker(input: {
  brand: Brand;
  asset: {
    id: string;
    campaignId: string;
    runId: string;
    channel: ChannelType;
    persona: string;
    title: string;
    body: string;
    claimIds: string[];
    approvalStage: ReturnType<typeof approvalStageForAsset>;
    metadata: Record<string, unknown>;
  };
  claims: Claim[];
  peerAssets?: {
    id: string;
    title: string;
    body: string;
    channel: ChannelType;
    claimIds: string[];
    approvalStage: ReturnType<typeof approvalStageForAsset>;
    metadata: Record<string, unknown>;
  }[];
}) {
  return buildCritique({
    brand: input.brand,
    asset: input.asset as any,
    claims: input.claims,
    peerAssets: input.peerAssets as any,
  });
}

export function learningWorker(input: {
  brand: Brand;
  campaign: Campaign;
  run: Run;
  research: MarketResearch;
  positioning: PositioningPlan;
  assets: Array<{
    id: string;
    channel: ChannelType;
    title: string;
    body: string;
    status: string;
    claimIds: string[];
  }>;
  approvals: Array<{
    assetId: string;
    decision: string;
    reviewer: string;
    reason: string;
    overrideReason?: string | null;
  }>;
  outcomes?: Outcome[];
}): MemoryWrite[] {
  const approvedAssets = input.assets.filter((asset) => {
    const approval = input.approvals.find((item) => item.assetId === asset.id);
    return approval?.decision === "approve" || approval?.decision === "override";
  });

  const writes: MemoryWrite[] = [
    {
      scope: "brand",
      memoryType: "instruction",
      content: `Approved voice for ${input.brand.name}: ${input.brand.voice.tone}. Preferred phrases: ${input.brand.voice.preferredPhrases.join(", ")}.`,
      tags: [input.brand.slug, "voice"],
      namespace: `brand:${input.brand.slug}`,
      importance: 0.85,
      metadata: {
        approvedClaims: approvedAssets.flatMap((asset) => asset.claimIds),
        campaignId: input.campaign.id,
      },
    },
    {
      scope: "campaign",
      memoryType: "goal",
      content: `Campaign ${input.campaign.name} targeted ${input.campaign.targetPersonas.join(", ")} across ${input.campaign.channels.join(", ")} with ${approvedAssets.length} approved asset(s).`,
      tags: [input.brand.slug, input.campaign.id],
      namespace: `campaign:${input.campaign.id}`,
      importance: 0.8,
      metadata: {
        goal: input.campaign.goal,
        campaignType: input.campaign.campaignType,
      },
    },
    {
      scope: "market",
      memoryType: "factual",
      content: `Market learning for ${input.brand.name}: objections included ${input.research.marketObjections.join(" | ")}.`,
      tags: [input.brand.slug, "market", input.campaign.id],
      namespace: `market:${input.brand.slug}`,
      importance: 0.7,
      metadata: {
        competitorSnapshot: input.research.competitorSnapshot,
        opportunities: input.research.opportunities,
      },
    },
    {
      scope: "working",
      memoryType: "event",
      content: `Run ${input.run.id} ended in ${input.run.status}. Approved assets: ${approvedAssets.map((asset) => asset.title).join("; ")}.`,
      tags: [input.brand.slug, input.run.id],
      namespace: `working:${input.run.id}`,
      importance: 0.65,
      metadata: {
        runId: input.run.id,
        approvalCount: input.approvals.length,
      },
    },
  ];

  if (input.outcomes && input.outcomes.length > 0) {
    writes.push({
      scope: "performance",
      memoryType: scopeToMemoryType("performance"),
      content: `Performance learning for ${input.brand.name}: ${input.outcomes.length} outcome(s) recorded across ${[...new Set(input.outcomes.map((outcome) => outcome.channel).filter(Boolean))].join(", ")}.`,
      tags: [input.brand.slug, "performance"],
      namespace: `performance:${input.brand.slug}`,
      importance: 0.85,
      metadata: {
        outcomes: input.outcomes.map((outcome) => outcome.metrics),
      },
    });
  }

  return writes;
}
