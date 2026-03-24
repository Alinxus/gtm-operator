import type { Claim, SignalSource } from "./domain.js";

export type RetainDbPainId =
  | "user_preference_memory"
  | "cross_session_continuity"
  | "grounded_docs"
  | "knowledge_update"
  | "support_continuity"
  | "agent_workflow_memory"
  | "coding_context_grounding"
  | "research_memory";

export interface RetainDbPainProfile {
  id: RetainDbPainId;
  label: string;
  description: string;
  keywords: string[];
  buyerSignals: string[];
  capabilityClaimIds: string[];
  proofClaimIds: string[];
  outcomeAngles: string[];
  objections: string[];
  preferredSources: SignalSource[];
}

export interface RetainDbStrength {
  title: string;
  summary: string;
  claimIds: string[];
}

export interface RetainDbWeakness {
  title: string;
  summary: string;
  proof: string;
}

export interface RetainDbFitAnalysis {
  painIds: RetainDbPainId[];
  primaryPainId: RetainDbPainId | null;
  primaryPainLabel: string | null;
  painScore: number;
  qualificationScore: number;
  proofReadinessScore: number;
  shippingAiScore: number;
  integrationReadinessScore: number;
  buyingReadinessScore: number;
  matchedCapabilityClaimIds: string[];
  matchedProofClaimIds: string[];
  matchedClaimIds: string[];
  outcomeAngles: string[];
  objections: string[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
}

export const RETAINDB_PAIN_TAXONOMY: RetainDbPainProfile[] = [
  {
    id: "user_preference_memory",
    label: "User preference memory",
    description: "The product forgets user preferences, style, habits, or durable personal context.",
    keywords: ["preference", "preferences", "personalization", "personalised", "remember users", "user profile", "taste", "style", "likes", "dislikes"],
    buyerSignals: ["users come back", "agent forgets", "assistant restarts", "personalization"],
    capabilityClaimIds: ["retainedb-persistent-memory", "retainedb-memory-model"],
    proofClaimIds: ["retainedb-preference-recall-88"],
    outcomeAngles: ["better personalization", "less repeated setup", "agents that remember users across sessions"],
    objections: ["we already store profiles", "this is just a preference table", "we can build this ourselves"],
    preferredSources: ["x", "linkedin", "reddit", "form", "product", "manual"],
  },
  {
    id: "cross_session_continuity",
    label: "Cross-session continuity",
    description: "The assistant loses important context between sessions or tasks.",
    keywords: ["across sessions", "multi-session", "session", "continuity", "forgets context", "history", "conversation continuity", "stateful", "resume"],
    buyerSignals: ["users return later", "long-running workflow", "session continuity"],
    capabilityClaimIds: ["retainedb-persistent-memory", "retainedb-three-calls", "retainedb-memory-model"],
    proofClaimIds: ["retainedb-overall-accuracy-79"],
    outcomeAngles: ["consistent agents across sessions", "less context rebuilding", "better long-running workflows"],
    objections: ["we already cache prompts", "we can keep session state ourselves"],
    preferredSources: ["product", "docs", "form", "github", "manual", "crm"],
  },
  {
    id: "grounded_docs",
    label: "Grounded docs and trusted answers",
    description: "The assistant hallucinates, gives stale answers, or fails to answer from docs.",
    keywords: ["docs", "documentation", "hallucination", "hallucinations", "stale", "knowledge base", "kb", "grounded", "answer from docs", "wrong answer"],
    buyerSignals: ["support agent", "internal assistant", "customer docs", "knowledge search"],
    capabilityClaimIds: ["retainedb-grounded-docs", "retainedb-tree-search", "retainedb-canonical-memory-api"],
    proofClaimIds: ["retainedb-grounded-docs-zero-hallucination", "retainedb-sub40-p95"],
    outcomeAngles: ["answers from docs, not guesses", "fewer hallucinations", "safer retrieval for support and product assistants"],
    objections: ["we already have RAG", "our vector search is enough", "hallucinations are model problems"],
    preferredSources: ["docs", "form", "github", "reddit", "hacker_news", "y_combinator"],
  },
  {
    id: "knowledge_update",
    label: "Knowledge update and freshness",
    description: "The system struggles when information changes or needs version-aware memory.",
    keywords: ["stale knowledge", "updated docs", "latest data", "changing docs", "versioning", "freshness", "knowledge update", "new policy"],
    buyerSignals: ["rapidly changing docs", "product updates", "compliance", "changing catalog"],
    capabilityClaimIds: ["retainedb-memory-model", "retainedb-grounded-docs", "retainedb-canonical-memory-api"],
    proofClaimIds: ["retainedb-overall-accuracy-79"],
    outcomeAngles: ["agents that stay current", "less stale context", "version-aware memory and retrieval"],
    objections: ["we can just reindex nightly", "this is a docs pipeline issue"],
    preferredSources: ["docs", "product", "github", "manual", "y_combinator"],
  },
  {
    id: "support_continuity",
    label: "Support conversation continuity",
    description: "Support or success workflows need continuity across multiple contacts and channels.",
    keywords: ["support", "ticket", "customer success", "handoff", "case history", "conversation history", "follow-up", "account context"],
    buyerSignals: ["support agent", "account history", "handoffs", "multi-touch"],
    capabilityClaimIds: ["retainedb-persistent-memory", "retainedb-grounded-docs", "retainedb-memory-model"],
    proofClaimIds: ["retainedb-overall-accuracy-79", "retainedb-grounded-docs-zero-hallucination"],
    outcomeAngles: ["better support continuity", "less repeated context from customers", "cleaner handoffs"],
    objections: ["our CRM already stores this", "support can just read the ticket"],
    preferredSources: ["docs", "form", "product", "linkedin", "manual", "crm"],
  },
  {
    id: "agent_workflow_memory",
    label: "Agent workflow memory",
    description: "The product needs memory inside agent loops, tools, or multi-step workflows.",
    keywords: ["agent", "workflow", "tool call", "planner", "multi-step", "state machine", "agent loop", "memory router", "mcp"],
    buyerSignals: ["agent framework", "tool-using agent", "workflow automation", "copilot"],
    capabilityClaimIds: ["retainedb-canonical-mcp-surface", "retainedb-canonical-memory-api", "retainedb-zero-rearchitecting", "retainedb-any-llm"],
    proofClaimIds: ["retainedb-three-calls", "retainedb-sub40-p95"],
    outcomeAngles: ["memory infrastructure for real agents", "less glue code", "fits existing agent stacks"],
    objections: ["we can store state in Redis", "this is just orchestration"],
    preferredSources: ["github", "hacker_news", "reddit", "x", "docs", "y_combinator"],
  },
  {
    id: "coding_context_grounding",
    label: "Coding assistant context grounding",
    description: "Developer tools need memory plus grounded code/docs context inside coding workflows.",
    keywords: ["codebase", "repo", "coding agent", "copilot", "mcp", "local files", "workspace", "sdk", "ide"],
    buyerSignals: ["developer tool", "coding assistant", "repo awareness", "mcp"],
    capabilityClaimIds: ["retainedb-canonical-mcp-surface", "retainedb-tree-search", "retainedb-zero-rearchitecting"],
    proofClaimIds: ["retainedb-sub40-p95", "retainedb-any-llm"],
    outcomeAngles: ["grounded coding agents", "repo-aware memory and retrieval", "MCP-native developer workflows"],
    objections: ["we already index code", "we use repo embeddings already"],
    preferredSources: ["github", "hacker_news", "reddit", "docs", "y_combinator"],
  },
  {
    id: "research_memory",
    label: "Research and synthesis memory",
    description: "The product needs to remember sourced findings and work across long research threads.",
    keywords: ["research", "source", "citation", "synthesis", "browse", "investigation", "notes", "long thread"],
    buyerSignals: ["analyst workflow", "agent research", "citations", "long-running task"],
    capabilityClaimIds: ["retainedb-tree-search", "retainedb-canonical-mcp-surface", "retainedb-memory-model"],
    proofClaimIds: ["retainedb-overall-accuracy-79"],
    outcomeAngles: ["research agents that remember", "better source grounding", "less repeated digging"],
    objections: ["we can just use notebooks", "this is overkill for research"],
    preferredSources: ["reddit", "hacker_news", "x", "docs", "manual", "y_combinator"],
  },
];

export const RETAINDB_STRENGTHS: RetainDbStrength[] = [
  {
    title: "Persistent memory plus grounded docs in one product",
    summary: "RetainDB is not just doc retrieval and not just memory. It combines durable memory with grounded answers from docs.",
    claimIds: ["retainedb-persistent-memory", "retainedb-grounded-docs"],
  },
  {
    title: "Fast integration path for teams already shipping AI",
    summary: "The strongest wedge for early users is that it fits into an existing stack in three calls, works with any LLM, and avoids a rewrite.",
    claimIds: ["retainedb-three-calls", "retainedb-zero-rearchitecting", "retainedb-any-llm"],
  },
  {
    title: "Preference-heavy memory is a standout area",
    summary: "The benchmark evidence is especially strong on single-session preference recall, which is a sharp wedge against generic retrieval or profile hacks.",
    claimIds: ["retainedb-preference-recall-88"],
  },
  {
    title: "Agent-native depth beyond basic RAG",
    summary: "The product goes beyond vector search with a richer memory model, MCP surface, and Oracle tree search for deeper agent workflows.",
    claimIds: ["retainedb-memory-model", "retainedb-canonical-mcp-surface", "retainedb-tree-search"],
  },
];

export const RETAINDB_WEAKNESSES: RetainDbWeakness[] = [
  {
    title: "Temporal reasoning still trails the strongest published competitor",
    summary: "Current LongMemEval oracle results show temporal reasoning below Supermemory's published number.",
    proof: "RetainDB 74% vs Supermemory 76.7% on temporal reasoning in benchmarks/RESULTS.md.",
  },
  {
    title: "Knowledge update is a clear improvement area",
    summary: "Knowledge-update performance is solid but trails the leading published comparison.",
    proof: "RetainDB 76% vs Supermemory 88.5% on knowledge update in benchmarks/RESULTS.md.",
  },
  {
    title: "Multi-session performance is promising, not dominant",
    summary: "Multi-session is better than some alternatives but not yet the category-winning proof point.",
    proof: "RetainDB 68% vs Supermemory 71.4% and Zep 57.9% in benchmarks/RESULTS.md.",
  },
  {
    title: "Assistant-generated memory is intentionally not the wedge",
    summary: "RetainDB intentionally does not position around recalling assistant-generated content, so that should not be the lead pitch.",
    proof: "benchmarks/RESULTS.md notes single-session-assistant is excluded by design.",
  },
];

function normalize(text: string) {
  return text.toLowerCase();
}

function hasAny(text: string, phrases: string[]) {
  const lower = normalize(text);
  return phrases.some((phrase) => lower.includes(phrase.toLowerCase()));
}

function countMatches(text: string, terms: string[]) {
  const lower = normalize(text);
  return terms.filter((term) => lower.includes(term.toLowerCase())).length;
}

function clamp(value: number, max = 100) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function selectExistingClaimIds(claimIds: string[], claims: Claim[]) {
  const existing = new Set(claims.map((claim) => claim.id));
  return unique(claimIds.filter((claimId) => existing.has(claimId)));
}

export function analyzeRetainDbFit(input: {
  title: string;
  content: string;
  source: SignalSource;
  accountName: string;
  role?: string | null;
  documents?: Array<{ title: string; content: string; excerpt?: string | null }>;
  claims: Claim[];
}) : RetainDbFitAnalysis {
  const combinedText = [
    input.title,
    input.content,
    input.accountName,
    input.role ?? "",
    ...(input.documents ?? []).flatMap((document) => [document.title, document.content, document.excerpt ?? ""]),
  ].join("\n");
  const lower = normalize(combinedText);

  const shippingAiSignals = ["ai", "agent", "llm", "copilot", "assistant", "workflow", "automation", "sdk", "mcp", "rag"];
  const integrationSignals = ["api", "sdk", "integrate", "integration", "deploy", "ship", "stack", "infra", "developer", "tooling"];
  const buyingSignals = ["pricing", "demo", "pilot", "vendor", "need", "looking", "buy", "budget", "replace", "evaluate"];
  const urgencySignals = ["urgent", "broken", "failing", "too many", "problem", "pain", "slow", "manual", "hallucination", "forgets"];

  const rankedPains = RETAINDB_PAIN_TAXONOMY.map((pain) => {
    const keywordHits = countMatches(lower, pain.keywords);
    const buyerHits = countMatches(lower, pain.buyerSignals);
    const sourceBoost = pain.preferredSources.includes(input.source) ? 1 : 0;
    const rawScore = keywordHits * 18 + buyerHits * 12 + sourceBoost * 8;
    return {
      pain,
      score: clamp(rawScore, 100),
      matchedKeywords: pain.keywords.filter((keyword) => lower.includes(keyword.toLowerCase())),
    };
  }).sort((a, b) => b.score - a.score);

  const matchedPains = rankedPains.filter((item) => item.score >= 18);
  const primary = matchedPains[0] ?? null;
  const painIds = matchedPains.map((item) => item.pain.id);

  const shippingAiScore = Math.min(100, countMatches(lower, shippingAiSignals) * 16 + (hasAny(lower, ["founder", "cto", "engineer", "developer"]) ? 18 : 0));
  const integrationReadinessScore = Math.min(100, countMatches(lower, integrationSignals) * 14 + (hasAny(lower, ["works with", "existing stack", "mcp", "sdk"]) ? 18 : 0));
  const buyingReadinessScore = Math.min(100, countMatches(lower, buyingSignals) * 18 + (hasAny(lower, ["form", "pricing", "docs", "contact us"]) ? 8 : 0));
  const urgencyScore = Math.min(100, countMatches(lower, urgencySignals) * 14 + matchedPains.length * 8);
  const painScore = primary ? clamp(primary.score * 0.65 + Math.min(30, matchedPains.length * 8)) : 0;

  const matchedCapabilityClaimIds = selectExistingClaimIds(
    matchedPains.flatMap((item) => item.pain.capabilityClaimIds),
    input.claims,
  );
  const matchedProofClaimIds = selectExistingClaimIds(
    matchedPains.flatMap((item) => item.pain.proofClaimIds),
    input.claims,
  );
  const matchedClaimIds = unique([...matchedCapabilityClaimIds, ...matchedProofClaimIds]);
  const proofReadinessScore = clamp(matchedProofClaimIds.length * 24 + matchedCapabilityClaimIds.length * 10 + (primary ? 18 : 0));
  const qualificationScore = clamp(
    shippingAiScore * 0.28 +
      integrationReadinessScore * 0.2 +
      buyingReadinessScore * 0.22 +
      painScore * 0.2 +
      urgencyScore * 0.1,
  );

  const reasons = unique([
    shippingAiScore >= 40 ? "already looks like an AI-shipping team" : "AI-shipping signal is still weak",
    primary ? `primary pain looks like ${primary.pain.label.toLowerCase()}` : "pain fit is still ambiguous",
    proofReadinessScore >= 45 ? "there is a clean proof path for this account" : "proof path is still soft",
    qualificationScore >= 65 ? "this could convert soon if the pain is real" : "this may need nurturing or better evidence",
  ]);

  const strengths = RETAINDB_STRENGTHS.filter((strength) => strength.claimIds.some((claimId) => matchedClaimIds.includes(claimId))).map((strength) => strength.summary);
  const weaknesses = RETAINDB_WEAKNESSES
    .filter((weakness) =>
      primary
        ? (primary.pain.id === "knowledge_update" && weakness.title.toLowerCase().includes("knowledge")) ||
          (primary.pain.id === "cross_session_continuity" && weakness.title.toLowerCase().includes("multi-session")) ||
          (primary.pain.id === "research_memory" && weakness.title.toLowerCase().includes("temporal")) ||
          weakness.title.toLowerCase().includes("assistant-generated")
        : weakness.title.toLowerCase().includes("assistant-generated"),
    )
    .map((weakness) => weakness.summary);

  return {
    painIds,
    primaryPainId: primary?.pain.id ?? null,
    primaryPainLabel: primary?.pain.label ?? null,
    painScore,
    qualificationScore,
    proofReadinessScore,
    shippingAiScore,
    integrationReadinessScore,
    buyingReadinessScore,
    matchedCapabilityClaimIds,
    matchedProofClaimIds,
    matchedClaimIds,
    outcomeAngles: unique(matchedPains.flatMap((item) => item.pain.outcomeAngles)),
    objections: unique(matchedPains.flatMap((item) => item.pain.objections)),
    strengths,
    weaknesses,
    reasons,
  };
}
