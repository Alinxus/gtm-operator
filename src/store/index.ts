export { InMemoryMarketingStore } from "./in-memory-store.js";
export { PostgresMarketingStore } from "./postgres-store.js";

import { MockMemoryProvider, RetainDbHttpMemoryProvider } from "../memory.js";
import type { MemoryProvider, MarketingStore } from "../domain.js";
import { InMemoryMarketingStore } from "./in-memory-store.js";
import { PostgresMarketingStore } from "./postgres-store.js";

export function createMarketingStore(databaseUrl?: string): MarketingStore {
  if (databaseUrl && databaseUrl.trim().length > 0) {
    return PostgresMarketingStore.connect(databaseUrl);
  }

  return new InMemoryMarketingStore();
}

export function createMemoryProvider(options: {
  provider: "retaindb-http" | "mock";
  baseUrl?: string;
  apiKey?: string;
  project: string;
}): MemoryProvider {
  if (options.provider === "retaindb-http") {
    if (!options.baseUrl || options.baseUrl.trim().length === 0) {
      throw new Error("RetainDB memory provider requires a baseUrl.");
    }
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new Error("RetainDB memory provider requires an API key.");
    }

    return new RetainDbHttpMemoryProvider({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      project: options.project,
    });
  }

  return new MockMemoryProvider();
}
