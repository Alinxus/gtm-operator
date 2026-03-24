import { randomUUID } from "node:crypto";
import type { MemoryProvider, MemorySearchInput, MemorySearchResult, MemoryWrite } from "./domain.js";

export type RetainDbHttpMemoryProviderOptions = {
  baseUrl: string;
  apiKey?: string;
  project: string;
};

function normalizeBearer(apiKey?: string) {
  if (!apiKey) return undefined;
  return apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
}

function buildHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = normalizeBearer(apiKey)!;
    headers["X-API-Key"] = apiKey.replace(/^Bearer\s+/i, "");
  }

  return headers;
}

function scoreOverlap(query: string, content: string) {
  const qTokens = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
  const cTokens = new Set(content.toLowerCase().split(/\s+/).filter(Boolean));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;
  let matches = 0;
  for (const token of qTokens) {
    if (cTokens.has(token)) matches += 1;
  }
  return matches / qTokens.size;
}

export class MockMemoryProvider implements MemoryProvider {
  private readonly memories = new Map<string, MemoryWrite & { project: string; id: string }>();

  async add(write: MemoryWrite & { project: string }) {
    const id = randomUUID();
    this.memories.set(id, { ...write, id });
    return { id };
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const results = [...this.memories.values()]
      .filter((memory) => memory.project === input.project)
      .filter((memory) => {
        if (!input.namespace) return true;
        return memory.namespace === input.namespace;
      })
      .filter((memory) => {
        if (!input.memoryTypes || input.memoryTypes.length === 0) return true;
        return input.memoryTypes.includes(memory.memoryType);
      })
      .map((memory) => ({
        id: memory.id,
        content: memory.content,
        metadata: memory.metadata,
        score: scoreOverlap(input.query, memory.content),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return results.slice(0, input.limit ?? 10);
  }
}

export class RetainDbHttpMemoryProvider implements MemoryProvider {
  constructor(private readonly options: RetainDbHttpMemoryProviderOptions) {}

  async add(write: MemoryWrite & { project: string }) {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/memory`, {
      method: "POST",
      headers: buildHeaders(this.options.apiKey),
      body: JSON.stringify({
        project: write.project,
        content: write.content,
        memory_type: write.memoryType,
        importance: write.importance ?? 0.5,
        namespace: write.namespace,
        tags: write.tags ?? [],
        metadata: {
          ...(write.metadata ?? {}),
          scope: write.scope,
        },
        session_id: write.sessionId,
        user_id: write.userId,
        async: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`RetainDB memory write failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const id =
      typeof payload.memory_id === "string"
        ? payload.memory_id
        : typeof payload.id === "string"
          ? payload.id
          : typeof payload?.memory === "object" && payload.memory && typeof (payload.memory as { id?: unknown }).id === "string"
            ? (payload.memory as { id: string }).id
            : randomUUID();

    return { id };
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/memory/search`, {
      method: "POST",
      headers: buildHeaders(this.options.apiKey),
      body: JSON.stringify({
        query: input.query,
        project: input.project,
        memory_types: input.memoryTypes,
        namespace: input.namespace,
        limit: input.limit ?? 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`RetainDB memory search failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const candidates = Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.memories)
        ? payload.memories
        : Array.isArray(payload.data)
          ? payload.data
          : [];

    return candidates.slice(0, input.limit ?? 10).map((item: any) => ({
      id: typeof item?.id === "string" ? item.id : typeof item?.memory?.id === "string" ? item.memory.id : randomUUID(),
      content:
        typeof item?.content === "string"
          ? item.content
          : typeof item?.memory?.content === "string"
            ? item.memory.content
            : "",
      metadata:
        typeof item?.metadata === "object"
          ? item.metadata
          : typeof item?.memory?.metadata === "object"
            ? item.memory.metadata
            : undefined,
      score:
        typeof item?.score === "number"
          ? item.score
          : typeof item?.relevance === "number"
            ? item.relevance
            : undefined,
    }));
  }
}

export function scopeToMemoryType(scope: MemoryWrite["scope"]): MemoryWrite["memoryType"] {
  switch (scope) {
    case "brand":
      return "instruction";
    case "campaign":
      return "goal";
    case "market":
      return "factual";
    case "performance":
      return "event";
    case "working":
      return "event";
  }
}

