/**
 * AIAgent — Hermes-style agentic loop for the marketing operator.
 *
 * Replaces the single-shot ChatAgent intent classifier with a full
 * multi-step tool-calling loop. The agent receives a set of operator tools
 * and iterates until it produces a final text response or reaches the
 * iteration limit.
 *
 * Drop-in replacement for ChatAgent — same chat() signature and response type.
 */

import type { AppConfig } from "./config.js";
import type { LanguageModelProvider, AgentMessage, ToolDefinition } from "./llm.js";
import type { MarketingStore } from "./domain.js";
import type { GrowthOperator } from "./growth-operator.js";
import type { ResearchCoordinator } from "./research-connectors.js";
import { runContentDistributionWorker, runHnCommentWorker } from "./operator-workers.js";

const MAX_ITERATIONS = 12;

// ---------------------------------------------------------------------------
// Public types (same as ChatAgent for drop-in compatibility)
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAgentResponse {
  text: string;
  intent: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Tool context — scoped to a single chat() call
// ---------------------------------------------------------------------------

interface ToolContext {
  workspaceId: string;
  store: MarketingStore;
  operator: GrowthOperator;
  research: ResearchCoordinator;
  config: AppConfig;
  llm: LanguageModelProvider;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function buildTools(ctx: ToolContext): Array<{ definition: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<string> }> {
  return [
    // -----------------------------------------------------------------------
    // hunt_prospects
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "hunt_prospects",
        description: "Scan a signal source (yc, github, x, reddit, hn) for leads matching the workspace ICP. Returns count of signals ingested and sequences auto-generated.",
        parameters: {
          type: "object",
          properties: {
            source: {
              type: "string",
              enum: ["yc", "github", "x", "reddit", "hn"],
              description: "Signal source to scan",
            },
            query: {
              type: "string",
              description: "Search query — keywords describing the target audience or problem",
            },
            maxResults: {
              type: "number",
              description: "Max signals to retrieve (default 10, max 20)",
            },
          },
          required: ["source"],
        },
      },
      handler: async (args) => {
        const source = String(args.source ?? "yc").toLowerCase();
        const query = String(args.query ?? "");
        const maxResults = Math.min(Number(args.maxResults ?? 10), 20);

        let result: { documents: unknown[]; ingested: unknown[] };
        let label = source;

        if (source === "yc" || source === "ycombinator") {
          label = "YCombinator";
          result = await ctx.research.syncYCombinator({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: true });
        } else if (source === "github") {
          label = "GitHub";
          result = await ctx.research.syncGitHub({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: false });
        } else if (source === "x" || source === "twitter") {
          label = "X/Twitter";
          if (!ctx.config.xBearerToken) return JSON.stringify({ error: "X bearer token not configured. Set X_BEARER_TOKEN." });
          result = await ctx.research.syncX({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: false });
        } else if (source === "reddit") {
          label = "Reddit";
          result = await ctx.research.syncReddit({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: false });
        } else if (source === "hn" || source === "hackernews") {
          label = "Hacker News";
          result = await ctx.research.syncHackerNews({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: false });
        } else {
          label = "YCombinator";
          result = await ctx.research.syncYCombinator({ workspaceId: ctx.workspaceId, query: query || "ai agent", maxResults, autoGenerateSequence: true });
        }

        return JSON.stringify({ source: label, query, ingested: result.ingested.length, message: `Ingested ${result.ingested.length} signals from ${label}. Check Pending Approvals to review sequences.` });
      },
    },

    // -----------------------------------------------------------------------
    // draft_content
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "draft_content",
        description: "Generate content for a platform: x_thread, reddit_post, newsletter_pitch, or hn_comment.",
        parameters: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["x_thread", "reddit_post", "newsletter_pitch", "hn_comment"],
              description: "Target platform",
            },
            topic: {
              type: "string",
              description: "What to write about",
            },
            context: {
              type: "string",
              description: "Optional extra context (e.g. thread title for HN comments)",
            },
          },
          required: ["platform", "topic"],
        },
      },
      handler: async (args) => {
        const platform = String(args.platform ?? "x_thread") as "x_thread" | "reddit_post" | "newsletter_pitch" | "hn_comment";
        const topic = String(args.topic ?? "our product");
        const context = args.context ? String(args.context) : undefined;

        const workspace = await ctx.store.findWorkspaceById(ctx.workspaceId).catch(() => null);
        if (!workspace) return JSON.stringify({ error: `Workspace ${ctx.workspaceId} not found.` });

        const brand = await ctx.store.findBrandById(workspace.brandId).catch(() => null);
        if (!brand) return JSON.stringify({ error: "Brand not found for this workspace." });

        const allClaims = await ctx.store.listClaimsByBrand(workspace.brandId).catch(() => []);
        const claims = allClaims.filter((c) => c.status === "verified");

        if (platform === "hn_comment") {
          const draft = await runHnCommentWorker({ llm: ctx.llm, brand, threadTitle: topic, threadContent: context ?? topic, threadUrl: "", claims });
          if (!draft) return JSON.stringify({ error: "LLM is disabled." });
          return JSON.stringify({ platform, draft, message: "HN comment drafted — post manually." });
        }

        const draft = await runContentDistributionWorker({ llm: ctx.llm, brand, workspace, claims, topic, context, platform });
        if (!draft) return JSON.stringify({ error: "LLM is disabled." });
        return JSON.stringify({ platform, draft });
      },
    },

    // -----------------------------------------------------------------------
    // get_digest
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "get_digest",
        description: "Get the workspace dashboard summary — pending approvals, approved touches ready to send, and today's top opportunities.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      handler: async () => {
        const dashboard = await ctx.operator.getWorkspaceDashboard(ctx.workspaceId);
        const pendingApprovals = (dashboard.approvals ?? []).filter((a) => a.touch.status === "review_required" || a.touch.status === "needs_revision");
        const readyToSend = (dashboard.approvals ?? []).filter((a) => a.touch.status === "approved");
        const hotOpps = (dashboard.today ?? []).slice(0, 5);

        return JSON.stringify({
          workspace: dashboard.workspace?.name,
          icp: dashboard.workspace?.primaryIcp,
          pendingApprovals: pendingApprovals.length,
          readyToSend: readyToSend.length,
          todayOpportunities: hotOpps.length,
          topOpportunities: hotOpps.map((o) => o.reason),
        });
      },
    },

    // -----------------------------------------------------------------------
    // list_pending
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "list_pending",
        description: "List touches awaiting review or approved and ready to send.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "approved", "all"],
              description: "Filter by status (default: all)",
            },
          },
          required: [],
        },
      },
      handler: async (args) => {
        const filter = String(args.status ?? "all");
        const allTouches = await ctx.store.listTouchesByWorkspace(ctx.workspaceId).catch(() => []);

        const pending = allTouches.filter((t) => t.status === "review_required" || t.status === "needs_revision");
        const approved = allTouches.filter((t) => t.status === "approved");

        const result: Record<string, unknown> = {};
        if (filter === "all" || filter === "pending") {
          result.pending = pending.slice(0, 20).map((t) => ({ id: t.id, type: t.touchType, title: (t.title || t.body).slice(0, 80), status: t.status }));
        }
        if (filter === "all" || filter === "approved") {
          result.approved = approved.slice(0, 20).map((t) => ({
            id: t.id,
            type: t.touchType,
            title: (t.title || t.body).slice(0, 80),
            scheduledFor: t.metadata?.scheduledFor ?? null,
          }));
        }

        return JSON.stringify(result);
      },
    },

    // -----------------------------------------------------------------------
    // send_touch
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "send_touch",
        description: "Dispatch an approved touch by ID. Only works for touches with status=approved.",
        parameters: {
          type: "object",
          properties: {
            touchId: {
              type: "string",
              description: "The touch ID to send",
            },
          },
          required: ["touchId"],
        },
      },
      handler: async (args) => {
        const touchId = String(args.touchId ?? "").trim();
        if (!touchId) return JSON.stringify({ error: "touchId is required." });

        const touch = await ctx.store.findTouchById(touchId).catch(() => null);
        if (!touch) return JSON.stringify({ error: `Touch ${touchId} not found.` });
        if (touch.status !== "approved") return JSON.stringify({ error: `Touch ${touchId} is "${touch.status}" — only approved touches can be sent.` });

        if (touch.touchType === "email" || touch.touchType === "follow_up") {
          if (!ctx.config.resendApiKey || !ctx.config.resendFromAddress) {
            return JSON.stringify({ error: "Email sending not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS." });
          }
          const result = await ctx.operator.sendApprovedEmailTouch({
            touchId,
            resendApiKey: ctx.config.resendApiKey,
            resendFromAddress: ctx.config.resendFromAddress,
            resendFromName: ctx.config.resendFromName,
            githubToken: ctx.config.githubToken,
            hunterApiKey: ctx.config.hunterApiKey,
          });
          return JSON.stringify(result);
        }

        if (touch.touchType === "post" || touch.touchType === "public_reply" || touch.touchType === "dm") {
          if (!ctx.config.xAccessToken) return JSON.stringify({ error: "X access token not configured. Set X_ACCESS_TOKEN." });
          const result = await ctx.operator.sendApprovedXTouch({
            touchId,
            xAccessToken: ctx.config.xAccessToken,
            oauthClientId: ctx.config.xOauthClientId,
            oauthClientSecret: ctx.config.xOauthClientSecret,
          });
          return JSON.stringify(result);
        }

        if (touch.touchType === "community_post") {
          if (!ctx.config.redditBearerToken) return JSON.stringify({ error: "Reddit bearer token not configured. Set REDDIT_BEARER_TOKEN." });
          const result = await ctx.operator.sendApprovedRedditTouch({
            touchId,
            redditBearerToken: ctx.config.redditBearerToken,
            userAgent: ctx.config.researchHttpUserAgent,
            redditClientId: ctx.config.redditClientId,
            redditClientSecret: ctx.config.redditClientSecret,
          });
          return JSON.stringify(result);
        }

        return JSON.stringify({ sent: false, reason: `Touch type "${touch.touchType}" requires manual posting.` });
      },
    },

    // -----------------------------------------------------------------------
    // ingest_website
    // -----------------------------------------------------------------------
    {
      definition: {
        name: "ingest_website",
        description: "Sync and ingest a website or documentation URL as a research signal.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to ingest" },
          },
          required: ["url"],
        },
      },
      handler: async (args) => {
        const url = String(args.url ?? "").trim();
        if (!url) return JSON.stringify({ error: "url is required." });
        const result = await ctx.research.syncWebsite({ workspaceId: ctx.workspaceId, urls: [url], autoGenerateSequence: false });
        return JSON.stringify({ url, ingested: (result as any).ingested?.length ?? 0, message: `Website ingested.` });
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// AIAgent
// ---------------------------------------------------------------------------

export class AIAgent {
  constructor(
    private readonly options: {
      llm: LanguageModelProvider;
      store: MarketingStore;
      operator: GrowthOperator;
      research: ResearchCoordinator;
      config: AppConfig;
    },
  ) {}

  async chat(input: {
    workspaceId: string;
    message: string;
    history?: ConversationMessage[];
  }): Promise<ChatAgentResponse> {
    if (!this.options.llm.enabled) {
      return {
        text: "LLM is not configured. Set DEFAULT_LLM_PROVIDER=openai (or anthropic) and the corresponding API key to enable the chat interface.",
        intent: "disabled",
      };
    }

    const ctx: ToolContext = {
      workspaceId: input.workspaceId,
      store: this.options.store,
      operator: this.options.operator,
      research: this.options.research,
      config: this.options.config,
      llm: this.options.llm,
    };

    const tools = buildTools(ctx);
    const toolDefs = tools.map((t) => t.definition);
    const toolMap = new Map(tools.map((t) => [t.definition.name, t.handler]));

    // Load workspace context for system prompt
    const workspace = await this.options.store.findWorkspaceById(input.workspaceId).catch(() => null);
    const workspaceName = workspace?.name ?? input.workspaceId;
    const workspaceIcp = workspace?.primaryIcp ?? "not set";

    const systemPrompt = [
      `You are a GTM operator agent for the workspace "${workspaceName}".`,
      `ICP: ${workspaceIcp}`,
      "",
      "Use the available tools to fulfill the operator's request. You can call multiple tools in sequence.",
      "When you have enough information to give a complete, actionable response, stop calling tools and reply directly.",
      "Be concise. Use markdown for lists and emphasis. Never ask for confirmation before calling tools.",
    ].join("\n");

    // Build initial messages from history + current message
    const messages: AgentMessage[] = [];
    for (const h of input.history ?? []) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: "user", content: input.message });

    // Agent loop
    let lastText = "";
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await this.options.llm.generateWithTools({
        system: systemPrompt,
        messages,
        tools: toolDefs,
        temperature: 0.2,
        maxOutputTokens: 2048,
      });

      if (result.type === "text") {
        lastText = result.text ?? "";
        break;
      }

      // Execute tool calls
      const toolCalls = result.toolCalls ?? [];

      // Append assistant message with tool_calls
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Execute each tool and append results
      for (const tc of toolCalls) {
        const handler = toolMap.get(tc.name);
        let toolResult: string;
        if (!handler) {
          toolResult = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
        } else {
          try {
            toolResult = await handler(tc.arguments);
          } catch (err) {
            toolResult = JSON.stringify({ error: (err as Error).message });
          }
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
      }
    }

    if (!lastText) {
      lastText = "I wasn't able to complete the request within the iteration limit. Please try a more specific command.";
    }

    return { text: lastText, intent: "agent" };
  }
}
