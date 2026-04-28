import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import { runAgentTick } from "./agent-tick.js";
import { GrowthOperator } from "./growth-operator.js";
import { createLanguageModelProvider } from "./llm.js";
import { ResearchCoordinator } from "./research-connectors.js";

type HyperdriveBinding = {
  connectionString?: string;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
};

type WorkerEnv = Record<string, unknown> & {
  HYPERDRIVE?: HyperdriveBinding;
};

const seededRuntimeKeys = new Set<string>();

function workerEnvToConfig(env: WorkerEnv): AppConfig {
  const merged: NodeJS.ProcessEnv = { ...process.env };

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  if (!merged.DATABASE_URL && typeof env.HYPERDRIVE?.connectionString === "string") {
    merged.DATABASE_URL = env.HYPERDRIVE.connectionString;
  }

  return loadConfig(merged);
}

function cacheKey(config: AppConfig) {
  return JSON.stringify({
    databaseUrl: config.databaseUrl,
    retainedbBaseUrl: config.retainedbBaseUrl,
    retainedbProject: config.retainedbProject,
    defaultMemoryProvider: config.defaultMemoryProvider,
    defaultLlmProvider: config.defaultLlmProvider,
    openaiModel: config.openaiModel,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, executionContext: WorkerExecutionContext) {
    const config = workerEnvToConfig(env);
    const key = cacheKey(config);
    const runtime = await createRuntime(config, {
      ensureSchema: false,
      seedOnBoot: !seededRuntimeKeys.has(key),
    });
    seededRuntimeKeys.add(key);
    return runtime.app.fetch(request, env, executionContext as never);
  },

  async scheduled(_event: { cron: string }, env: WorkerEnv, ctx: WorkerExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const config = workerEnvToConfig(env);
        const { store, memoryProvider } = await createRuntime(config, { ensureSchema: false, seedOnBoot: false });
        const llmProvider = createLanguageModelProvider({
          provider: config.defaultLlmProvider,
          apiKey: config.defaultLlmProvider === "anthropic" ? config.anthropicApiKey : config.openaiApiKey,
          baseUrl: config.openaiBaseUrl,
          model: config.defaultLlmProvider === "anthropic" ? config.anthropicModel : config.openaiModel,
        });
        const operator = new GrowthOperator({
          store,
          memoryProvider,
          llmProvider,
          githubToken: config.githubToken,
          githubAppId: config.githubAppId,
          githubAppPrivateKey: config.githubAppPrivateKey,
          githubAppInstallationId: config.githubAppInstallationId,
        });
        const research = new ResearchCoordinator({
          operator,
          xBearerToken: config.xBearerToken,
          redditBearerToken: config.redditBearerToken,
          linkedinAccessToken: config.linkedinAccessToken,
          cloudflareAccountId: config.cloudflareAccountId,
          cloudflareApiToken: config.cloudflareApiToken,
          githubToken: config.githubToken,
          userAgent: config.researchHttpUserAgent,
        });
        await runAgentTick({ store, operator, config, research });
      })(),
    );
  },
};
