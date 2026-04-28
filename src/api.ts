import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ChannelType, MarketingStore, MemoryProvider } from "./domain.js";
import type { AppConfig } from "./config.js";
import { MarketingOrchestrator } from "./orchestrator.js";
import { createId, isoNow } from "./domain.js";
import { defaultChannelsForCampaignType } from "./state-machine.js";
import { GrowthOperator } from "./growth-operator.js";
import { createOperatorApp } from "./operator-api.js";
import { createLanguageModelProvider } from "./llm.js";

const brandVoiceSchema = z.object({
  tone: z.string().min(1).default("technical, direct, builder-native, proof-first"),
  styleRules: z.array(z.string()).default([]),
  preferredPhrases: z.array(z.string()).default([]),
  forbiddenPhrases: z.array(z.string()).default([]),
  founderVoiceNotes: z.array(z.string()).default([]),
});

const brandCreateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  memoryProvider: z.enum(["retaindb-http", "mock"]).optional(),
  memoryProject: z.string().optional(),
  voice: brandVoiceSchema.optional(),
});

const claimSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["benchmark", "feature", "integration", "pricing", "security", "comparison", "roadmap", "proof", "voice", "other"]),
  status: z.enum(["verified", "inferred", "deprecated", "disputed", "forbidden"]),
  text: z.string().min(1),
  sourceUrls: z.array(z.string()).default([]),
  sourceExcerpt: z.string().optional(),
  requiredQualifiers: z.array(z.string()).default([]),
  allowedChannels: z.array(z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"])).default(["social", "community", "outbound", "seo", "reply", "partnership", "landing"]),
  forbiddenVariants: z.array(z.string()).default([]),
  owner: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  lastVerifiedAt: z.string().optional(),
});

const campaignCreateSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  campaignType: z.enum(["launch", "content_engine", "founder_social", "partnership_outbound", "competitive_response", "other"]),
  targetPersonas: z.array(z.string()).default([]),
  channels: z.array(z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"])).default([]),
  brief: z.string().min(1),
  constraints: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const approvalBodySchema = z.object({
  reviewer: z.string().min(1),
  reason: z.string().optional(),
  overrideReason: z.string().optional(),
});

const outcomeSchema = z.object({
  runId: z.string().min(1),
  assetId: z.string().optional(),
  channel: z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"]).optional(),
  metrics: z.record(z.union([z.number(), z.string(), z.boolean()])),
  feedback: z.string().optional(),
});

function jsonError(message: string, status = 400, details?: unknown) {
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid request body"), { details: parsed.error.flatten() });
  }
  return parsed.data;
}

function defaultBrandVoice() {
  return {
    tone: "technical, direct, builder-native, proof-first, product-led, contrastive, confident without fluff",
    styleRules: [
      "Lead with the problem in plain language.",
      "Use short, direct sentences.",
      "Prefer outcome plus mechanism plus proof.",
      "Use contrast framing when it helps.",
      "Avoid hype, vagueness, and strategy-deck language.",
    ],
    preferredPhrases: [
      "persistent memory",
      "grounded docs",
      "works with any LLM",
      "zero rearchitecting",
      "numbers you can hold us to",
    ],
    forbiddenPhrases: ["best in the world", "magic memory", "perfect memory", "revolutionary"],
    founderVoiceNotes: [
      "Sound like the person who built the system and can prove how it works.",
      "Lead with specifics, then the implication.",
    ],
  };
}

export function createApp(options: {
  store: MarketingStore;
  memoryProvider: MemoryProvider;
  config: AppConfig;
}) {
  const orchestrator = new MarketingOrchestrator({
    store: options.store,
    memoryProvider: options.memoryProvider,
    defaultMemoryProject: options.config.retainedbProject,
  });
  const llmProvider = createLanguageModelProvider({
    provider: options.config.defaultLlmProvider,
    apiKey: options.config.defaultLlmProvider === "anthropic"
      ? options.config.anthropicApiKey
      : options.config.openaiApiKey,
    baseUrl: options.config.openaiBaseUrl,
    model: options.config.defaultLlmProvider === "anthropic"
      ? options.config.anthropicModel
      : options.config.openaiModel,
  });
  const operator = new GrowthOperator({
    store: options.store,
    memoryProvider: options.memoryProvider,
    llmProvider,
    githubToken: options.config.githubToken,
    githubAppId: options.config.githubAppId,
    githubAppPrivateKey: options.config.githubAppPrivateKey,
    githubAppInstallationId: options.config.githubAppInstallationId,
    publishUserAgent: options.config.researchHttpUserAgent,
    defaultPublishDestinations: [
      ...(options.config.defaultWebhookPublishUrl
        ? [
            {
              kind: "webhook_export" as const,
              name: "Default webhook export",
              supportedChannels: ["social", "community", "reply", "outbound", "partnership"] as ChannelType[],
              config: {
                targetUrl: options.config.defaultWebhookPublishUrl,
                ...(options.config.defaultWebhookPublishSecret ? { secret: options.config.defaultWebhookPublishSecret } : {}),
                payloadVersion: "v1",
              },
            },
          ]
        : []),
      ...(options.config.defaultGithubPublishOwner && options.config.defaultGithubPublishRepo
        ? [
            {
              kind: "github_pr" as const,
              name: "Default GitHub publisher",
              supportedChannels: ["seo", "landing"] as ChannelType[],
              config: {
                owner: options.config.defaultGithubPublishOwner,
                repo: options.config.defaultGithubPublishRepo,
                baseBranch: options.config.defaultGithubPublishBaseBranch ?? "main",
                contentRoot: options.config.defaultGithubPublishContentRoot ?? "content",
                pathTemplate: options.config.defaultGithubPublishPathTemplate ?? "{{content_root}}/{{slug}}.mdx",
              },
            },
          ]
        : []),
    ],
  });

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: options.config.corsAllowedOrigins.includes("*")
        ? "*"
        : (origin) => {
            if (!origin) return options.config.corsAllowedOrigins[0] ?? "*";
            return options.config.corsAllowedOrigins.includes(origin) ? origin : "";
          },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.onError((error) => jsonError((error as Error).message, 500));

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/v1/meta", (c) =>
    c.json({
      service: "retaindb-marketing-orchestrator",
      tenantScoped: true,
      memoryProvider: options.config.defaultMemoryProvider,
      llmProvider: options.config.defaultLlmProvider,
      defaultBrandSlug: options.config.defaultBrandSlug,
      seeded: options.config.seedOnBoot,
    }),
  );

  app.get("/v1/brands", async (c) => c.json({ brands: await options.store.listBrands() }));

  app.post("/v1/brands", async (c) => {
    try {
      const body = await parseBody(c.req.raw, brandCreateSchema);
      const voice = body.voice ? brandVoiceSchema.parse(body.voice) : defaultBrandVoice();
      const brand = await options.store.createBrand({
        id: createId("brand"),
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        memoryProvider: body.memoryProvider ?? options.config.defaultMemoryProvider,
        memoryProject: body.memoryProject ?? `${body.slug}-marketing`,
        voice,
      });
      const workspace = await operator.ensureDefaultWorkspace(brand);

      return c.json({ brand, workspace }, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v1/brands/:brandId", async (c) => {
    const brand = await options.store.findBrandById(c.req.param("brandId"));
    if (!brand) return jsonError("Brand not found", 404);
    return c.json({ brand });
  });

  app.get("/v1/brands/:brandId/claims", async (c) => {
    const brand = await options.store.findBrandById(c.req.param("brandId"));
    if (!brand) return jsonError("Brand not found", 404);
    return c.json({ claims: await options.store.listClaimsByBrand(brand.id) });
  });

  app.post("/v1/brands/:brandId/claims/import", async (c) => {
    try {
      const body = await parseBody(c.req.raw, z.object({ claims: z.array(claimSchema) }));
      const brand = await options.store.findBrandById(c.req.param("brandId"));
      if (!brand) return jsonError("Brand not found", 404);

      const claims = [];
      for (const claim of body.claims) {
        const normalized = claimSchema.parse(claim);
        claims.push(
          await options.store.upsertClaim({
            id: normalized.id,
            brandId: brand.id,
            category: normalized.category,
            status: normalized.status,
            text: normalized.text,
            sourceUrls: normalized.sourceUrls ?? [],
            sourceExcerpt: normalized.sourceExcerpt ?? null,
            requiredQualifiers: normalized.requiredQualifiers ?? [],
            allowedChannels: normalized.allowedChannels ?? [],
            forbiddenVariants: normalized.forbiddenVariants ?? [],
            owner: normalized.owner ?? null,
            metadata: normalized.metadata ?? {},
            lastVerifiedAt: normalized.lastVerifiedAt ?? null,
          }),
        );
      }

      return c.json({ claims }, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.patch("/v1/claims/:claimId", async (c) => {
    try {
      const body = await parseBody(
        c.req.raw,
        claimSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field must be updated"),
      );
      const updated = await options.store.updateClaim(c.req.param("claimId"), body);
      if (!updated) return jsonError("Claim not found", 404);
      return c.json({ claim: updated });
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v1/campaigns", async (c) => {
    try {
      const body = await parseBody(c.req.raw, campaignCreateSchema);
      const brand = await options.store.findBrandById(body.brandId);
      if (!brand) return jsonError("Brand not found", 404);

      const campaign = await options.store.createCampaign({
        id: createId("campaign"),
        brandId: brand.id,
        name: body.name,
        goal: body.goal,
        campaignType: body.campaignType,
        targetPersonas: body.targetPersonas ?? [],
        channels: (body.channels ?? []).length > 0 ? (body.channels ?? []) : defaultChannelsForCampaignType(body.campaignType),
        brief: body.brief,
        constraints: body.constraints ?? [],
        status: "draft",
        metadata: body.metadata ?? {},
      });

      return c.json({ campaign }, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v1/campaigns/:campaignId", async (c) => {
    const campaign = await options.store.findCampaignById(c.req.param("campaignId"));
    if (!campaign) return jsonError("Campaign not found", 404);
    return c.json({ campaign });
  });

  app.post("/v1/runs", async (c) => {
    try {
      const body = await parseBody(c.req.raw, z.object({ campaignId: z.string().min(1) }));
      const bundle = await orchestrator.startCampaignRun(body.campaignId);
      return c.json(bundle, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  app.get("/v1/runs/:runId", async (c) => {
    try {
      return c.json(await orchestrator.getRunBundle(c.req.param("runId")));
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v1/runs/:runId/bundle", async (c) => {
    try {
      return c.json(await orchestrator.getRunBundle(c.req.param("runId")));
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v1/runs/:runId/resume", async (c) => {
    try {
      return c.json(await orchestrator.resumeRun(c.req.param("runId")));
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  app.post("/v1/assets/:assetId/approve", async (c) => {
    try {
      const body = await parseBody(c.req.raw, approvalBodySchema);
      return c.json(
        await orchestrator.approveAsset({
          assetId: c.req.param("assetId"),
          reviewer: body.reviewer,
          reason: body.reason,
          decision: "approve",
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v1/assets/:assetId/reject", async (c) => {
    try {
      const body = await parseBody(c.req.raw, approvalBodySchema);
      return c.json(
        await orchestrator.rejectAsset({
          assetId: c.req.param("assetId"),
          reviewer: body.reviewer,
          reason: body.reason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v1/assets/:assetId/override", async (c) => {
    try {
      const body = await parseBody(c.req.raw, approvalBodySchema);
      return c.json(
        await orchestrator.overrideAsset({
          assetId: c.req.param("assetId"),
          reviewer: body.reviewer,
          reason: body.reason,
          overrideReason: body.overrideReason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v1/assets/:assetId/revise", async (c) => {
    try {
      const body = await parseBody(c.req.raw, approvalBodySchema);
      return c.json(
        await orchestrator.reviseAsset({
          assetId: c.req.param("assetId"),
          reviewer: body.reviewer,
          reason: body.reason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v1/outcomes", async (c) => {
    try {
      const body = await parseBody(c.req.raw, outcomeSchema);
      return c.json(await orchestrator.recordOutcome(body), 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v1/runs/:runId/stream", async (c) => {
    try {
      const bundle = await orchestrator.getRunBundle(c.req.param("runId"));
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(bundle)}\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.route(
    "/",
    createOperatorApp({
      store: options.store,
      memoryProvider: options.memoryProvider,
      operator,
      config: options.config,
    }),
  );

  return app;
}
