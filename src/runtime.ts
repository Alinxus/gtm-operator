import type { AppConfig } from "./config.js";
import { createApp } from "./api.js";
import { MarketingOrchestrator } from "./orchestrator.js";
import { createMemoryProvider, createMarketingStore } from "./store/index.js";

export async function createRuntime(
  config: AppConfig,
  options?: {
    ensureSchema?: boolean;
    seedOnBoot?: boolean;
  },
) {
  const store = createMarketingStore(config.databaseUrl);
  if (options?.ensureSchema !== false) {
    await store.ensureSchema?.();
  }

  const memoryProvider = createMemoryProvider({
    provider: config.defaultMemoryProvider,
    baseUrl: config.retainedbBaseUrl,
    apiKey: config.retainedbApiKey,
    project: config.retainedbProject,
  });

  const orchestrator = new MarketingOrchestrator({
    store,
    memoryProvider,
    defaultMemoryProject: config.retainedbProject,
  });

  if (options?.seedOnBoot ?? config.seedOnBoot) {
    await orchestrator.seed(false);
  }

  const app = createApp({ store, memoryProvider, config });
  return {
    app,
    store,
    memoryProvider,
    orchestrator,
  };
}
