import { Hono } from "hono";
import { z } from "zod";
import type { MarketingStore, MemoryProvider } from "./domain.js";
import type { AppConfig } from "./config.js";
import type { GrowthOperator } from "./growth-operator.js";
import { renderWorkspaceApp, renderWorkspaceDirectory } from "./operator-ui.js";
import { ResearchCoordinator } from "./research-connectors.js";
import { AIAgent } from "./agent.js";
import { DisabledLanguageModelProvider } from "./llm.js";

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

const signalCreateSchema = z.object({
  source: z.enum(["x", "linkedin", "reddit", "hacker_news", "github", "y_combinator", "docs", "product", "form", "manual", "crm"]),
  title: z.string().min(1),
  content: z.string().min(1),
  evidenceUrls: z.array(z.string()).default([]),
  account: z
    .object({
      id: z.string().optional(),
      name: z.string().min(1),
      domain: z.string().optional().nullable(),
      summary: z.string().optional(),
    })
    .optional(),
  person: z
    .object({
      id: z.string().optional(),
      name: z.string().min(1),
      role: z.string().min(1),
      email: z.string().optional().nullable(),
      socialHandle: z.string().optional().nullable(),
    })
    .optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const conversationSchema = z.object({
  accountId: z.string().min(1),
  personId: z.string().optional(),
  opportunityId: z.string().optional(),
  touchId: z.string().optional(),
  status: z.enum(["active", "booked", "qualified", "paid", "closed_lost"]),
  summary: z.string().min(1),
});

const touchDecisionSchema = z.object({
  reviewer: z.string().min(1),
  reason: z.string().optional(),
  overrideReason: z.string().optional(),
});

const batchDecisionSchema = touchDecisionSchema.extend({
  touchIds: z.array(z.string().min(1)).min(1),
  decision: z.enum(["approve", "reject", "override", "revise"]),
});

const websiteResearchSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  maxPages: z.number().int().positive().max(25).optional(),
  maxDepth: z.number().int().min(0).max(3).optional(),
  source: z.enum(["docs", "website"]).optional(),
  accountName: z.string().optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const githubResearchSchema = z.object({
  query: z.string().optional(),
  repo: z.string().optional(),
  maxResults: z.number().int().positive().max(20).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const xResearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(10).max(50).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const redditResearchSchema = z.object({
  query: z.string().min(1),
  subreddit: z.string().min(1).optional(),
  maxResults: z.number().int().positive().max(25).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const hackerNewsResearchSchema = z.object({
  query: z.string().min(1),
  storyType: z.enum(["top", "new", "ask", "show"]).optional(),
  maxResults: z.number().int().positive().max(20).optional(),
  scanLimit: z.number().int().positive().max(100).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const ycResearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(20).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const webSearchResearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(10).optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const linkedinResearchSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  autoGenerateSequence: z.boolean().optional(),
});

const formIngestSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  evidenceUrls: z.array(z.string().url()).default([]),
  account: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    domain: z.string().optional().nullable(),
    summary: z.string().optional(),
  }),
  person: z
    .object({
      id: z.string().optional(),
      name: z.string().min(1),
      role: z.string().min(1),
      email: z.string().optional().nullable(),
      socialHandle: z.string().optional().nullable(),
    })
    .optional(),
  autoGenerateSequence: z.boolean().optional(),
});

const laneRunSchema = z.object({
  priority: z.enum(["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"]).optional(),
  trigger: z.string().optional(),
  maxItems: z.number().int().positive().max(12).optional(),
  focus: z.string().optional(),
});

const socialCalendarSchema = z.object({
  count: z.number().int().positive().max(30).optional(),
  focus: z.string().optional(),
  priority: z.enum(["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"]).optional(),
  trigger: z.string().optional(),
});

const socialRepliesSchema = z.object({
  maxItems: z.number().int().positive().max(30).optional(),
  signalIds: z.array(z.string().min(1)).optional(),
  trigger: z.string().optional(),
});

const topicClusterSchema = z.object({
  count: z.number().int().positive().max(12).optional(),
  focus: z.string().optional(),
  priority: z.enum(["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"]).optional(),
  trigger: z.string().optional(),
});

const seoPageSchema = z.object({
  clusterId: z.string().optional(),
  pageType: z.enum(["compare", "use_case", "integration", "benchmark", "problem_solution", "docs_adjacent", "landing"]).optional(),
  count: z.number().int().positive().max(12).optional(),
  focus: z.string().optional(),
  priority: z.enum(["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"]).optional(),
  trigger: z.string().optional(),
});

const seoInventorySchema = z.object({
  pages: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(1),
        pageType: z.enum(["compare", "use_case", "integration", "benchmark", "problem_solution", "docs_adjacent", "landing"]).optional(),
        summary: z.string().optional(),
        url: z.string().url().optional().nullable(),
        state: z.enum(["existing", "missing", "stale", "draft", "approved", "published"]).optional(),
      }),
    )
    .optional(),
});

const campaignBurstSchema = z.object({
  burstType: z.enum(["launch", "benchmark", "integration", "partnership", "feature", "content_repurposing"]),
  name: z.string().optional(),
  goal: z.string().optional(),
  brief: z.string().min(1),
  priority: z.enum(["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"]).optional(),
  trigger: z.string().optional(),
});

const publishDestinationSchema = z.object({
  kind: z.enum(["github_pr", "webhook_export"]),
  name: z.string().min(1),
  supportedChannels: z.array(z.enum(["seo", "social", "outbound", "community", "reply", "partnership", "landing"])).min(1),
  config: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

const publishRequestSchema = z.object({
  destinationId: z.string().optional(),
});

export function createOperatorApp(options: {
  store: MarketingStore;
  memoryProvider: MemoryProvider;
  operator: GrowthOperator;
  config: AppConfig;
}) {
  const app = new Hono();
  const research = new ResearchCoordinator({
    operator: options.operator,
    userAgent: options.config.researchHttpUserAgent,
    openAiApiKey: options.config.openaiApiKey,
    openAiBaseUrl: options.config.openaiBaseUrl,
    openAiModel: options.config.openaiModel,
    githubToken: options.config.githubToken,
    githubAppId: options.config.githubAppId,
    githubAppPrivateKey: options.config.githubAppPrivateKey,
    githubAppInstallationId: options.config.githubAppInstallationId,
    cloudflareAccountId: options.config.cloudflareAccountId,
    cloudflareApiToken: options.config.cloudflareApiToken,
    xBearerToken: options.config.xBearerToken,
    redditBearerToken: options.config.redditBearerToken,
    linkedinAccessToken: options.config.linkedinAccessToken,
  });

  app.get("/v2/meta", (c) =>
    c.json({
      service: "retaindb-growth-operator",
      app: true,
      approvalBeforeSend: true,
      mixedChannel: true,
      compatibilityAlias: "gtm_operator",
      defaultMemoryProvider: options.config.defaultMemoryProvider,
      defaultBrandSlug: options.config.defaultBrandSlug,
      p1Channels: ["outbound", "reply", "social", "community", "landing"],
      p2Channels: ["seo"],
    }),
  );

  app.get("/v2/workspaces", async (c) => {
    const brandId = c.req.query("brandId") || undefined;
    return c.json({ workspaces: await options.operator.listWorkspaces(brandId) });
  });

  app.get("/v2/workspaces/:workspaceId", async (c) => {
    const workspace = await options.store.findWorkspaceById(c.req.param("workspaceId"));
    if (!workspace) return jsonError("Workspace not found", 404);
    return c.json({ workspace });
  });

  app.get("/v2/workspaces/:workspaceId/dashboard", async (c) => {
    try {
      return c.json(await options.operator.getWorkspaceDashboard(c.req.param("workspaceId")));
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/lanes", async (c) => {
    try {
      return c.json({
        lanes: await options.operator.listLanes(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/lanes/:lane/run", async (c) => {
    try {
      const body = await parseBody(c.req.raw, laneRunSchema);
      const lane = c.req.param("lane");
      if (!["outbound", "social", "seo", "campaign"].includes(lane)) return jsonError("Invalid lane", 400);
      return c.json(
        await options.operator.runLane({
          workspaceId: c.req.param("workspaceId"),
          lane: lane as "outbound" | "social" | "seo" | "campaign",
          priority: body.priority,
          trigger: body.trigger,
          maxItems: body.maxItems,
          focus: body.focus,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/lanes/:lane/runs", async (c) => {
    try {
      const lane = c.req.param("lane");
      if (!["outbound", "social", "seo", "campaign"].includes(lane)) return jsonError("Invalid lane", 400);
      return c.json({
        runs: await options.operator.listLaneRuns(c.req.param("workspaceId"), lane as "outbound" | "social" | "seo" | "campaign"),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/icp-profiles", async (c) => {
    return c.json({
      profiles: await options.store.listICPProfilesByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/prospects/accounts", async (c) => {
    return c.json({
      accounts: await options.store.listProspectAccountsByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/prospects/people", async (c) => {
    return c.json({
      people: await options.store.listProspectPeopleByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/prospects/accounts/:accountId/people", async (c) => {
    return c.json({
      people: await options.store.listProspectPeopleByAccount(c.req.param("accountId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/signals", async (c) => {
    return c.json({
      signals: await options.store.listSignalsByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.post("/v2/workspaces/:workspaceId/signals", async (c) => {
    try {
      const body = await parseBody(c.req.raw, signalCreateSchema);
      const signal = await options.operator.ingestSignal({
        workspaceId: c.req.param("workspaceId"),
        source: body.source,
        title: body.title,
        content: body.content,
        evidenceUrls: body.evidenceUrls ?? [],
        account: body.account,
        person: body.person,
        autoGenerateSequence: body.autoGenerateSequence,
      });
      return c.json(signal, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/forms/ingest", async (c) => {
    try {
      const body = await parseBody(c.req.raw, formIngestSchema);
      const signal = await options.operator.ingestSignal({
        workspaceId: c.req.param("workspaceId"),
        source: "form",
        title: body.title,
        content: body.content,
        evidenceUrls: body.evidenceUrls,
        account: body.account,
        person: body.person,
        autoGenerateSequence: body.autoGenerateSequence,
      });
      return c.json(signal, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/website", async (c) => {
    try {
      const body = await parseBody(c.req.raw, websiteResearchSchema);
      return c.json(
        await research.syncWebsite({
          workspaceId: c.req.param("workspaceId"),
          urls: body.urls,
          maxPages: body.maxPages,
          maxDepth: body.maxDepth,
          source: body.source,
          accountName: body.accountName,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/github", async (c) => {
    try {
      const body = await parseBody(c.req.raw, githubResearchSchema);
      return c.json(
        await research.syncGitHub({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          repo: body.repo,
          maxResults: body.maxResults,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/x", async (c) => {
    try {
      const body = await parseBody(c.req.raw, xResearchSchema);
      return c.json(
        await research.syncX({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          maxResults: body.maxResults,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/reddit", async (c) => {
    try {
      const body = await parseBody(c.req.raw, redditResearchSchema);
      return c.json(
        await research.syncReddit({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          subreddit: body.subreddit,
          maxResults: body.maxResults,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/hacker-news", async (c) => {
    try {
      const body = await parseBody(c.req.raw, hackerNewsResearchSchema);
      return c.json(
        await research.syncHackerNews({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          storyType: body.storyType,
          maxResults: body.maxResults,
          scanLimit: body.scanLimit,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/yc", async (c) => {
    try {
      const body = await parseBody(c.req.raw, ycResearchSchema);
      return c.json(
        await research.syncYCombinator({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          maxResults: body.maxResults,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/web-search", async (c) => {
    try {
      const body = await parseBody(c.req.raw, webSearchResearchSchema);
      return c.json(
        await research.syncWebSearch({
          workspaceId: c.req.param("workspaceId"),
          query: body.query,
          maxResults: body.maxResults,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/research/linkedin", async (c) => {
    try {
      const body = await parseBody(c.req.raw, linkedinResearchSchema);
      return c.json(
        await research.syncLinkedIn({
          workspaceId: c.req.param("workspaceId"),
          urls: body.urls,
          autoGenerateSequence: body.autoGenerateSequence,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/opportunities", async (c) => {
    return c.json({
      opportunities: await options.store.listOpportunitiesByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/sequences", async (c) => {
    return c.json({
      sequences: await options.store.listSequencesByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/touches", async (c) => {
    return c.json({
      touches: await options.store.listTouchesByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/social/calendar", async (c) => {
    return c.json({
      calendar: await options.store.listContentCalendarItemsByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.post("/v2/workspaces/:workspaceId/social/calendar/generate", async (c) => {
    try {
      const body = await parseBody(c.req.raw, socialCalendarSchema);
      return c.json(
        await options.operator.generateSocialCalendar({
          workspaceId: c.req.param("workspaceId"),
          count: body.count,
          focus: body.focus,
          priority: body.priority,
          trigger: body.trigger,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/social/assets", async (c) => {
    try {
      return c.json({
        assets: await options.operator.listSocialAssets(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/social/replies/generate", async (c) => {
    try {
      const body = await parseBody(c.req.raw, socialRepliesSchema);
      return c.json(
        await options.operator.generateSocialReplies({
          workspaceId: c.req.param("workspaceId"),
          maxItems: body.maxItems,
          signalIds: body.signalIds,
          trigger: body.trigger,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/seo/topic-clusters", async (c) => {
    try {
      return c.json({
        topicClusters: await options.operator.listTopicClusters(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/seo/topic-clusters/generate", async (c) => {
    try {
      const body = await parseBody(c.req.raw, topicClusterSchema);
      return c.json(
        await options.operator.generateTopicClusters({
          workspaceId: c.req.param("workspaceId"),
          count: body.count,
          focus: body.focus,
          priority: body.priority,
          trigger: body.trigger,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/seo/pages", async (c) => {
    try {
      return c.json({
        pages: await options.operator.listEvergreenPages(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/seo/pages/generate", async (c) => {
    try {
      const body = await parseBody(c.req.raw, seoPageSchema);
      return c.json(
        await options.operator.generateSeoPages({
          workspaceId: c.req.param("workspaceId"),
          clusterId: body.clusterId,
          pageType: body.pageType,
          count: body.count,
          focus: body.focus,
          priority: body.priority,
          trigger: body.trigger,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/seo/inventory/sync", async (c) => {
    try {
      const body = await parseBody(c.req.raw, seoInventorySchema);
      return c.json(
        await options.operator.syncSeoInventory({
          workspaceId: c.req.param("workspaceId"),
          pages: body.pages,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/campaign-bursts", async (c) => {
    try {
      return c.json({
        campaignBursts: await options.operator.listCampaignBursts(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/campaign-bursts", async (c) => {
    try {
      const body = await parseBody(c.req.raw, campaignBurstSchema);
      return c.json(
        await options.operator.createCampaignBurst({
          workspaceId: c.req.param("workspaceId"),
          burstType: body.burstType,
          name: body.name,
          goal: body.goal,
          brief: body.brief,
          priority: body.priority,
          trigger: body.trigger,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/campaign-bursts/:campaignBurstId", async (c) => {
    try {
      return c.json({
        campaignBurst: await options.operator.getCampaignBurst(c.req.param("campaignBurstId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/publish-destinations", async (c) => {
    try {
      return c.json({
        destinations: await options.operator.listPublishDestinations(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.post("/v2/workspaces/:workspaceId/publish-destinations", async (c) => {
    try {
      const body = await parseBody(c.req.raw, publishDestinationSchema);
      return c.json(
        await options.operator.createPublishDestination({
          workspaceId: c.req.param("workspaceId"),
          kind: body.kind,
          name: body.name,
          supportedChannels: body.supportedChannels,
          config: body.config,
          metadata: body.metadata,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/assets/:assetId/publish", async (c) => {
    try {
      const body = await parseBody(c.req.raw, publishRequestSchema);
      return c.json(
        await options.operator.publishAsset({
          assetId: c.req.param("assetId"),
          destinationId: body.destinationId,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/publish", async (c) => {
    try {
      const body = await parseBody(c.req.raw, publishRequestSchema);
      return c.json(
        await options.operator.publishTouch({
          touchId: c.req.param("touchId"),
          destinationId: body.destinationId,
        }),
        201,
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.get("/v2/workspaces/:workspaceId/publish-jobs", async (c) => {
    try {
      return c.json({
        jobs: await options.operator.listPublishJobs(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/goals", async (c) => {
    return c.json({
      goals: await options.store.listGoalsByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.get("/v2/workspaces/:workspaceId/approvals", async (c) => {
    try {
      return c.json({
        approvals: await options.operator.listApprovals(c.req.param("workspaceId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/outcomes", async (c) => {
    try {
      const dashboard = await options.operator.getWorkspaceDashboard(c.req.param("workspaceId"));
      return c.json({ outcomes: dashboard.outcomes });
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  app.get("/v2/workspaces/:workspaceId/conversations", async (c) => {
    return c.json({
      conversations: await options.store.listConversationsByWorkspace(c.req.param("workspaceId")),
    });
  });

  app.post("/v2/workspaces/:workspaceId/conversations", async (c) => {
    try {
      const body = await parseBody(c.req.raw, conversationSchema);
      const conversation = await options.operator.recordConversation({
        workspaceId: c.req.param("workspaceId"),
        accountId: body.accountId,
        personId: body.personId,
        opportunityId: body.opportunityId,
        touchId: body.touchId,
        status: body.status,
        summary: body.summary,
      });
      return c.json({ conversation }, 201);
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/workspaces/:workspaceId/approvals/batch", async (c) => {
    try {
      const body = await parseBody(c.req.raw, batchDecisionSchema);
      const approvals = await options.operator.recordTouchBatchDecision({
        workspaceId: c.req.param("workspaceId"),
        touchIds: body.touchIds,
        reviewer: body.reviewer,
        decision: body.decision,
        reason: body.reason,
        overrideReason: body.overrideReason,
      });
      return c.json({ approvals });
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/approve", async (c) => {
    try {
      const body = await parseBody(c.req.raw, touchDecisionSchema);
      return c.json(
        await options.operator.recordTouchDecision({
          touchId: c.req.param("touchId"),
          reviewer: body.reviewer,
          decision: "approve",
          reason: body.reason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/reject", async (c) => {
    try {
      const body = await parseBody(c.req.raw, touchDecisionSchema);
      return c.json(
        await options.operator.recordTouchDecision({
          touchId: c.req.param("touchId"),
          reviewer: body.reviewer,
          decision: "reject",
          reason: body.reason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/override", async (c) => {
    try {
      const body = await parseBody(c.req.raw, touchDecisionSchema);
      return c.json(
        await options.operator.recordTouchDecision({
          touchId: c.req.param("touchId"),
          reviewer: body.reviewer,
          decision: "override",
          reason: body.reason,
          overrideReason: body.overrideReason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/revise", async (c) => {
    try {
      const body = await parseBody(c.req.raw, touchDecisionSchema);
      return c.json(
        await options.operator.recordTouchDecision({
          touchId: c.req.param("touchId"),
          reviewer: body.reviewer,
          decision: "revise",
          reason: body.reason,
        }),
      );
    } catch (error) {
      return jsonError((error as Error).message, 400, (error as Error & { details?: unknown }).details);
    }
  });

  app.post("/v2/touches/:touchId/sent", async (c) => {
    try {
      return c.json({
        touch: await options.operator.markTouchSent(c.req.param("touchId")),
      });
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Send an approved email touch via SMTP or Resend
  app.post("/v2/touches/:touchId/send-email", async (c) => {
    const hasSmtp = !!(options.config.smtpHost && options.config.smtpUser && options.config.smtpPass && options.config.smtpFromAddress);
    const hasResend = !!(options.config.resendApiKey && options.config.resendFromAddress);
    if (!hasSmtp && !hasResend) {
      return jsonError("No email transport configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM_ADDRESS or RESEND_API_KEY/RESEND_FROM_ADDRESS.", 503);
    }
    try {
      const result = await options.operator.sendApprovedEmailTouch({
        touchId: c.req.param("touchId"),
        smtpHost: options.config.smtpHost,
        smtpPort: options.config.smtpPort,
        smtpUser: options.config.smtpUser,
        smtpPass: options.config.smtpPass,
        smtpFromAddress: options.config.smtpFromAddress,
        smtpFromName: options.config.smtpFromName,
        resendApiKey: options.config.resendApiKey,
        resendFromAddress: options.config.resendFromAddress,
        resendFromName: options.config.resendFromName,
        githubToken: options.config.githubToken,
        hunterApiKey: options.config.hunterApiKey,
      });
      return c.json(result, result.sent ? 200 : 422);
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Direct email send — bypasses touch/prospect pipeline
  app.post("/v2/workspaces/:workspaceId/email/send", async (c) => {
    try {
      const body = await parseBody(c.req.raw, z.object({
        to: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }));
      const result = await options.operator.sendDirectEmail({
        to: body.to,
        subject: body.subject,
        body: body.body,
        smtpHost: options.config.smtpHost,
        smtpPort: options.config.smtpPort,
        smtpUser: options.config.smtpUser,
        smtpPass: options.config.smtpPass,
        smtpFromAddress: options.config.smtpFromAddress,
        smtpFromName: options.config.smtpFromName,
        resendApiKey: options.config.resendApiKey,
        resendFromAddress: options.config.resendFromAddress,
        resendFromName: options.config.resendFromName,
      });
      return c.json(result, result.sent ? 200 : 422);
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Generate distribution content (X thread, Reddit post, newsletter pitch)
  app.post("/v2/workspaces/:workspaceId/content/generate", async (c) => {
    try {
      const body = await parseBody(c.req.raw, z.object({
        topic: z.string().min(1),
        context: z.string().optional(),
        platform: z.enum(["x_thread", "reddit_post", "newsletter_pitch"]),
      }));
      const workspace = await options.store.findWorkspaceById(c.req.param("workspaceId"));
      if (!workspace) return jsonError("Workspace not found", 404);
      const brand = await options.store.findBrandById(workspace.brandId);
      if (!brand) return jsonError("Brand not found", 404);
      const claims = await options.store.listClaimsByBrand(brand.id);
      const { runContentDistributionWorker } = await import("./operator-workers.js");
      const llm = options.operator.getLlmProvider?.() ?? { enabled: false as const, provider: "disabled" as const, generateText: async () => "", generateObject: async () => ({} as never), generateWithTools: async () => { throw new Error("LLM disabled"); } };
      const result = await runContentDistributionWorker({ llm, brand, workspace, claims, topic: body.topic, context: body.context, platform: body.platform });
      if (!result) return jsonError("LLM not configured (set DEFAULT_LLM_PROVIDER=openai)", 503);
      return c.json({ platform: body.platform, draft: result });
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Generate HN comment draft for a thread (manual posting)
  app.post("/v2/workspaces/:workspaceId/content/hn-comment", async (c) => {
    try {
      const body = await parseBody(c.req.raw, z.object({
        threadTitle: z.string().min(1),
        threadContent: z.string().min(1),
        threadUrl: z.string().min(1),
      }));
      const workspace = await options.store.findWorkspaceById(c.req.param("workspaceId"));
      if (!workspace) return jsonError("Workspace not found", 404);
      const brand = await options.store.findBrandById(workspace.brandId);
      if (!brand) return jsonError("Brand not found", 404);
      const claims = await options.store.listClaimsByBrand(brand.id);
      const { runHnCommentWorker } = await import("./operator-workers.js");
      const llm = options.operator.getLlmProvider?.() ?? { enabled: false as const, provider: "disabled" as const, generateText: async () => "", generateObject: async () => ({} as never), generateWithTools: async () => { throw new Error("LLM disabled"); } };
      const result = await runHnCommentWorker({ llm, brand, ...body, claims });
      if (!result) return jsonError("LLM not configured (set DEFAULT_LLM_PROVIDER=openai)", 503);
      return c.json({ draft: result, threadUrl: body.threadUrl });
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // HN manual queue — list approved community touches for HN
  app.get("/v2/workspaces/:workspaceId/hn-queue", async (c) => {
    try {
      const touches = await options.store.listTouchesByWorkspace(c.req.param("workspaceId"));
      const hnTouches = touches.filter(
        (t) => t.touchType === "community_post" && t.metadata?.platform === "hacker_news" && t.status === "approved",
      );
      return c.json({ touches: hnTouches });
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Send an approved X/Twitter touch (post, thread, or DM)
  app.post("/v2/touches/:touchId/send-x", async (c) => {
    if (!options.config.xAccessToken) {
      return jsonError("X not configured. Set X_ACCESS_TOKEN.", 503);
    }
    try {
      const result = await options.operator.sendApprovedXTouch({
        touchId: c.req.param("touchId"),
        xAccessToken: options.config.xAccessToken,
        oauthClientId: options.config.xOauthClientId,
        oauthClientSecret: options.config.xOauthClientSecret,
      });
      return c.json(result, result.sent ? 200 : 422);
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Send an approved Reddit touch (post or comment)
  app.post("/v2/touches/:touchId/send-reddit", async (c) => {
    if (!options.config.redditBearerToken) {
      return jsonError("Reddit not configured. Set REDDIT_BEARER_TOKEN.", 503);
    }
    try {
      const result = await options.operator.sendApprovedRedditTouch({
        touchId: c.req.param("touchId"),
        redditBearerToken: options.config.redditBearerToken,
        userAgent: options.config.researchHttpUserAgent,
        redditClientId: options.config.redditClientId,
        redditClientSecret: options.config.redditClientSecret,
      });
      return c.json(result, result.sent ? 200 : 422);
    } catch (error) {
      return jsonError((error as Error).message, 400);
    }
  });

  // Resend delivery event webhook
  app.post("/v2/webhooks/resend", async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header("resend-signature") ?? c.req.header("svix-signature") ?? null;

    if (options.config.resendWebhookSecret && signature) {
      const { verifyResendWebhookSignature } = await import("./sending.js");
      const valid = await verifyResendWebhookSignature(rawBody, signature, options.config.resendWebhookSecret);
      if (!valid) return jsonError("Invalid webhook signature", 401);
    }

    const { parseResendWebhookEvent } = await import("./sending.js");
    const event = parseResendWebhookEvent(JSON.parse(rawBody));
    if (!event) return c.json({ ok: true });

    try {
      const touchId = event.data.tags?.touch_id;
      if (!touchId) return c.json({ ok: true });

      if (event.type === "email.bounced") {
        await options.store.updateTouch(touchId, {
          status: "skipped",
          metadata: { bounceReason: event.data.bounce?.message ?? "bounced" },
        });
      } else if (event.type === "email.complained") {
        // Mark person as unsubscribed
        const touch = await options.store.findTouchById(touchId);
        if (touch) {
          const seq = await options.store.findSequenceById(touch.sequenceId);
          const opp = seq?.opportunityId ? await options.store.findOpportunityById(seq.opportunityId) : null;
          if (opp?.personId) {
            const person = await options.store.findProspectPersonById(opp.personId);
            if (person) {
              await options.store.updateProspectPerson(person.id, {
                metadata: { ...person.metadata, unsubscribed: true, unsubscribedAt: new Date().toISOString() },
              });
            }
          }
        }
      }
    } catch {
      // log but don't fail — always return 200 to Resend
    }
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Chat agent — natural language interface
  // ---------------------------------------------------------------------------

  const chatMessageSchema = z.object({
    message: z.string().min(1),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1),
        }),
      )
      .optional(),
  });

  app.post("/v2/workspaces/:workspaceId/chat", async (c) => {
    try {
      const { workspaceId } = c.req.param();
      const body = await parseBody(c.req.raw, chatMessageSchema);
      const llmProvider = options.operator.getLlmProvider() ?? new DisabledLanguageModelProvider();
      const agent = new AIAgent({
        llm: llmProvider,
        store: options.store,
        operator: options.operator,
        research,
        config: options.config,
        memoryProvider: options.memoryProvider,
      });
      const response = await agent.chat({
        workspaceId,
        message: body.message,
        history: body.history,
      });
      return c.json(response);
    } catch (error) {
      return jsonError((error as Error).message, 500);
    }
  });

  app.get("/app", async (c) => {
    const workspaces = await options.operator.listWorkspaces();
    if (workspaces.length === 1) {
      return c.redirect(`/app/${encodeURIComponent(workspaces[0]!.id)}`);
    }
    return c.html(renderWorkspaceDirectory(workspaces));
  });

  app.get("/app/:workspaceId", async (c) => {
    try {
      const dashboard = await options.operator.getWorkspaceDashboard(c.req.param("workspaceId"));
      return c.html(renderWorkspaceApp(dashboard));
    } catch (error) {
      return jsonError((error as Error).message, 404);
    }
  });

  return app;
}
