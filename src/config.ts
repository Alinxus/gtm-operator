import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8788),
  DATABASE_URL: z.string().trim().min(1).optional(),
  RETAINDB_BASE_URL: z.string().trim().min(1).default("https://api.retaindb.com"),
  RETAINDB_API_BASE_URL: z.string().trim().min(1).optional(),
  RETAINDB_API_URL: z.string().trim().min(1).optional(),
  RETAINDB_API_KEY: z.string().trim().optional(),
  RETAINDB_PROJECT: z.string().trim().min(1).default("retaindb-marketing"),
  DEFAULT_BRAND_SLUG: z.string().trim().min(1).default("retaindb"),
  DEFAULT_MEMORY_PROVIDER: z.enum(["retaindb-http", "mock"]).default("retaindb-http"),
  DEFAULT_LLM_PROVIDER: z.enum(["disabled", "openai", "anthropic"]).default("disabled"),
  OPENAI_BASE_URL: z.string().trim().min(1).default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-4.1-mini"),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-sonnet-4-6"),
  GITHUB_TOKEN: z.string().trim().optional(),
  GITHUB_APP_ID: z.string().trim().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().trim().optional(),
  GITHUB_APP_INSTALLATION_ID: z.string().trim().optional(),
  DEFAULT_GITHUB_PUBLISH_OWNER: z.string().trim().optional(),
  DEFAULT_GITHUB_PUBLISH_REPO: z.string().trim().optional(),
  DEFAULT_GITHUB_PUBLISH_BASE_BRANCH: z.string().trim().optional(),
  DEFAULT_GITHUB_PUBLISH_CONTENT_ROOT: z.string().trim().optional(),
  DEFAULT_GITHUB_PUBLISH_PATH_TEMPLATE: z.string().trim().optional(),
  DEFAULT_WEBHOOK_PUBLISH_URL: z.string().trim().optional(),
  DEFAULT_WEBHOOK_PUBLISH_SECRET: z.string().trim().optional(),
  CORS_ALLOWED_ORIGINS: z.string().trim().default("*"),
  CLOUDFLARE_ACCOUNT_ID: z.string().trim().optional(),
  CLOUDFLARE_API_TOKEN: z.string().trim().optional(),
  X_BEARER_TOKEN: z.string().trim().optional(),
  REDDIT_BEARER_TOKEN: z.string().trim().optional(),
  LINKEDIN_ACCESS_TOKEN: z.string().trim().optional(),
  RESEARCH_HTTP_USER_AGENT: z.string().trim().min(1).default("RetainDB-GTM-Operator/0.2 (+https://retaindb.com)"),
  SEED_ON_BOOT: z.coerce.boolean().default(true),
  ALLOW_IN_MEMORY_STORE: z.coerce.boolean().default(false),
  ALLOW_MOCK_MEMORY_PROVIDER: z.coerce.boolean().default(false),
  // Email finding
  HUNTER_API_KEY: z.string().trim().optional(),
  // Email sending (Resend)
  RESEND_API_KEY: z.string().trim().optional(),
  RESEND_FROM_ADDRESS: z.string().trim().optional(),
  RESEND_FROM_NAME: z.string().trim().min(1).default("Founder"),
  RESEND_WEBHOOK_SECRET: z.string().trim().optional(),
  // X / Twitter (pay-per-use API)
  X_ACCESS_TOKEN: z.string().trim().optional(),
  X_REFRESH_TOKEN: z.string().trim().optional(),
  X_OAUTH_CLIENT_ID: z.string().trim().optional(),
  X_OAUTH_CLIENT_SECRET: z.string().trim().optional(),
  // Reddit write
  REDDIT_CLIENT_ID: z.string().trim().optional(),
  REDDIT_CLIENT_SECRET: z.string().trim().optional(),
  REDDIT_REFRESH_TOKEN: z.string().trim().optional(),
  // Enrichment
  PDL_API_KEY: z.string().trim().optional(),
  // Cron / agent tick
  DIGEST_WEBHOOK_URL: z.string().trim().optional(),
  CRON_SIGNAL_SOURCES: z.string().trim().default("x,reddit,hn,yc,github"),
  CRON_MAX_SIGNALS_PER_TICK: z.coerce.number().int().positive().default(50),
});

export interface AppConfig {
  port: number;
  databaseUrl?: string;
  retainedbBaseUrl: string;
  retainedbApiKey?: string;
  retainedbProject: string;
  defaultBrandSlug: string;
  defaultMemoryProvider: "retaindb-http" | "mock";
  defaultLlmProvider: "disabled" | "openai" | "anthropic";
  openaiBaseUrl: string;
  openaiApiKey?: string;
  openaiModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  githubToken?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubAppInstallationId?: string;
  defaultGithubPublishOwner?: string;
  defaultGithubPublishRepo?: string;
  defaultGithubPublishBaseBranch?: string;
  defaultGithubPublishContentRoot?: string;
  defaultGithubPublishPathTemplate?: string;
  defaultWebhookPublishUrl?: string;
  defaultWebhookPublishSecret?: string;
  corsAllowedOrigins: string[];
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  xBearerToken?: string;
  redditBearerToken?: string;
  linkedinAccessToken?: string;
  researchHttpUserAgent: string;
  seedOnBoot: boolean;
  allowInMemoryStore: boolean;
  allowMockMemoryProvider: boolean;
  // Email finding
  hunterApiKey?: string;
  // Email sending
  resendApiKey?: string;
  resendFromAddress?: string;
  resendFromName: string;
  resendWebhookSecret?: string;
  // X / Twitter
  xAccessToken?: string;
  xRefreshToken?: string;
  xOauthClientId?: string;
  xOauthClientSecret?: string;
  // Reddit write
  redditClientId?: string;
  redditClientSecret?: string;
  redditRefreshToken?: string;
  // Enrichment
  pdlApiKey?: string;
  // Cron
  digestWebhookUrl?: string;
  cronSignalSources: string[];
  cronMaxSignalsPerTick: number;
}

function normalizeMultilineSecret(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\\n/g, "\n");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const databaseUrl = parsed.DATABASE_URL?.trim();
  const retainedbApiKey = parsed.RETAINDB_API_KEY?.trim();
  const openaiApiKey = parsed.OPENAI_API_KEY?.trim();
  const anthropicApiKey = parsed.ANTHROPIC_API_KEY?.trim();
  const githubToken = parsed.GITHUB_TOKEN?.trim();
  const githubAppId = parsed.GITHUB_APP_ID?.trim();
  const githubAppPrivateKey = normalizeMultilineSecret(parsed.GITHUB_APP_PRIVATE_KEY);
  const githubAppInstallationId = parsed.GITHUB_APP_INSTALLATION_ID?.trim();
  const defaultGithubPublishOwner = parsed.DEFAULT_GITHUB_PUBLISH_OWNER?.trim();
  const defaultGithubPublishRepo = parsed.DEFAULT_GITHUB_PUBLISH_REPO?.trim();
  const defaultGithubPublishBaseBranch = parsed.DEFAULT_GITHUB_PUBLISH_BASE_BRANCH?.trim();
  const defaultGithubPublishContentRoot = parsed.DEFAULT_GITHUB_PUBLISH_CONTENT_ROOT?.trim();
  const defaultGithubPublishPathTemplate = parsed.DEFAULT_GITHUB_PUBLISH_PATH_TEMPLATE?.trim();
  const defaultWebhookPublishUrl = parsed.DEFAULT_WEBHOOK_PUBLISH_URL?.trim();
  const defaultWebhookPublishSecret = parsed.DEFAULT_WEBHOOK_PUBLISH_SECRET?.trim();
  const corsAllowedOrigins = parsed.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const cloudflareAccountId = parsed.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cloudflareApiToken = parsed.CLOUDFLARE_API_TOKEN?.trim();
  const xBearerToken = parsed.X_BEARER_TOKEN?.trim();
  const redditBearerToken = parsed.REDDIT_BEARER_TOKEN?.trim();
  const linkedinAccessToken = parsed.LINKEDIN_ACCESS_TOKEN?.trim();
  const retainedbBaseUrl = parsed.RETAINDB_API_BASE_URL?.trim() || parsed.RETAINDB_API_URL?.trim() || parsed.RETAINDB_BASE_URL;

  if (!databaseUrl && !parsed.ALLOW_IN_MEMORY_STORE) {
    throw new Error("DATABASE_URL is required unless ALLOW_IN_MEMORY_STORE=true.");
  }

  if (parsed.DEFAULT_MEMORY_PROVIDER === "retaindb-http" && !retainedbApiKey) {
    throw new Error("RETAINDB_API_KEY is required when DEFAULT_MEMORY_PROVIDER=retaindb-http.");
  }

  if (parsed.DEFAULT_MEMORY_PROVIDER === "mock" && !parsed.ALLOW_MOCK_MEMORY_PROVIDER) {
    throw new Error("DEFAULT_MEMORY_PROVIDER=mock requires ALLOW_MOCK_MEMORY_PROVIDER=true.");
  }

  if (parsed.DEFAULT_LLM_PROVIDER === "openai" && !openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when DEFAULT_LLM_PROVIDER=openai.");
  }

  if (parsed.DEFAULT_LLM_PROVIDER === "anthropic" && !anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when DEFAULT_LLM_PROVIDER=anthropic.");
  }

  const hunterApiKey = parsed.HUNTER_API_KEY?.trim();
  const resendApiKey = parsed.RESEND_API_KEY?.trim();
  const resendFromAddress = parsed.RESEND_FROM_ADDRESS?.trim();
  const xAccessToken = parsed.X_ACCESS_TOKEN?.trim();
  const xRefreshToken = parsed.X_REFRESH_TOKEN?.trim();
  const xOauthClientId = parsed.X_OAUTH_CLIENT_ID?.trim();
  const xOauthClientSecret = parsed.X_OAUTH_CLIENT_SECRET?.trim();
  const redditClientId = parsed.REDDIT_CLIENT_ID?.trim();
  const redditClientSecret = parsed.REDDIT_CLIENT_SECRET?.trim();
  const redditRefreshToken = parsed.REDDIT_REFRESH_TOKEN?.trim();
  const pdlApiKey = parsed.PDL_API_KEY?.trim();
  const digestWebhookUrl = parsed.DIGEST_WEBHOOK_URL?.trim();
  const cronSignalSources = parsed.CRON_SIGNAL_SOURCES.split(",").map((s) => s.trim()).filter(Boolean);

  return {
    port: parsed.PORT,
    databaseUrl,
    retainedbBaseUrl,
    retainedbApiKey,
    retainedbProject: parsed.RETAINDB_PROJECT,
    defaultBrandSlug: parsed.DEFAULT_BRAND_SLUG,
    defaultMemoryProvider: parsed.DEFAULT_MEMORY_PROVIDER,
    defaultLlmProvider: parsed.DEFAULT_LLM_PROVIDER,
    openaiBaseUrl: parsed.OPENAI_BASE_URL,
    openaiApiKey,
    openaiModel: parsed.OPENAI_MODEL,
    anthropicApiKey,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    githubToken,
    githubAppId,
    githubAppPrivateKey,
    githubAppInstallationId,
    defaultGithubPublishOwner,
    defaultGithubPublishRepo,
    defaultGithubPublishBaseBranch,
    defaultGithubPublishContentRoot,
    defaultGithubPublishPathTemplate,
    defaultWebhookPublishUrl,
    defaultWebhookPublishSecret,
    corsAllowedOrigins: corsAllowedOrigins.length > 0 ? corsAllowedOrigins : ["*"],
    cloudflareAccountId,
    cloudflareApiToken,
    xBearerToken,
    redditBearerToken,
    linkedinAccessToken,
    researchHttpUserAgent: parsed.RESEARCH_HTTP_USER_AGENT,
    seedOnBoot: parsed.SEED_ON_BOOT,
    allowInMemoryStore: parsed.ALLOW_IN_MEMORY_STORE,
    allowMockMemoryProvider: parsed.ALLOW_MOCK_MEMORY_PROVIDER,
    hunterApiKey,
    resendApiKey,
    resendFromAddress,
    resendFromName: parsed.RESEND_FROM_NAME,
    resendWebhookSecret: parsed.RESEND_WEBHOOK_SECRET?.trim(),
    xAccessToken,
    xRefreshToken,
    xOauthClientId,
    xOauthClientSecret,
    redditClientId,
    redditClientSecret,
    redditRefreshToken,
    pdlApiKey,
    digestWebhookUrl,
    cronSignalSources,
    cronMaxSignalsPerTick: parsed.CRON_MAX_SIGNALS_PER_TICK,
  };
}
