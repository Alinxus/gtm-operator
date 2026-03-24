/**
 * Chat Agent — natural language interface for the marketing operator.
 *
 * Accepts free-text commands, classifies intent via LLM structured output,
 * and dispatches to the underlying operator / research coordinator methods.
 *
 * Example commands:
 *   "find YC W25 AI agent companies and qualify against our ICP"
 *   "what should I focus on today?"
 *   "draft a Twitter thread about our benchmark results"
 *   "show pending approvals"
 *   "send touch abc123"
 */

import { z } from "zod";
import type { LanguageModelProvider } from "./llm.js";
import type { MarketingStore } from "./domain.js";
import type { GrowthOperator } from "./growth-operator.js";
import type { ResearchCoordinator } from "./research-connectors.js";
import type { AppConfig } from "./config.js";
import { runContentDistributionWorker, runHnCommentWorker } from "./operator-workers.js";

// ---------------------------------------------------------------------------
// Intent schema
// ---------------------------------------------------------------------------

const intentSchema = z.object({
  intent: z.enum([
    "hunt_prospects",   // scan a source (YC, GitHub, X, Reddit, HN) for leads
    "draft_content",    // generate X thread, Reddit post, newsletter pitch, HN comment
    "get_digest",       // summarise pending opportunities / dashboard
    "list_pending",     // list touches awaiting approval or ready to send
    "send_touch",       // dispatch a specific approved touch
    "unknown",          // fallback — reply with suggestions
  ]),
  params: z.record(z.unknown()).optional(),
  reasoning: z.string().min(1),
});

type IntentName = "hunt_prospects" | "draft_content" | "get_digest" | "list_pending" | "send_touch" | "unknown";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAgentResponse {
  text: string;
  intent: IntentName;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// ChatAgent
// ---------------------------------------------------------------------------

export class ChatAgent {
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
        text: "LLM is not configured. Set DEFAULT_LLM_PROVIDER=openai and OPENAI_API_KEY to enable the chat interface.",
        intent: "unknown",
      };
    }

    // 1. Fetch workspace context for the system prompt
    const workspace = await this.options.store
      .findWorkspaceById(input.workspaceId)
      .catch(() => null);

    const workspaceName = workspace?.name ?? input.workspaceId;
    const workspaceIcp = workspace?.primaryIcp ?? "not set";

    // 2. Classify the intent
    const historyText =
      input.history && input.history.length > 0
        ? input.history
            .slice(-6) // keep last 3 turns
            .map((m) => `${m.role === "user" ? "Operator" : "Agent"}: ${m.content}`)
            .join("\n")
        : "";

    let classified: z.infer<typeof intentSchema>;
    try {
      classified = await this.options.llm.generateObject({
        schema: intentSchema,
        system: [
          `You are a GTM agent for the workspace "${workspaceName}".`,
          `ICP: ${workspaceIcp}`,
          "Classify the operator's request into exactly one intent.",
          "Extract relevant params (source, query, platform, touchId, count, topic, context) as strings.",
          "Return JSON only.",
        ].join("\n"),
        prompt: [
          historyText ? `Recent conversation:\n${historyText}\n` : "",
          `Operator: ${input.message}`,
          "",
          "Intents:",
          "- hunt_prospects: scan a signal source for matching leads (params: source, query, maxResults)",
          "- draft_content: generate content for a platform (params: platform, topic, context)",
          "- get_digest: summarise today's dashboard / what to focus on",
          "- list_pending: list touches waiting for approval or scheduled to send",
          "- send_touch: send a specific touch by ID (params: touchId)",
          "- unknown: anything else",
        ]
          .filter(Boolean)
          .join("\n"),
        temperature: 0.1,
        maxOutputTokens: 400,
      });
    } catch {
      return {
        text: "Sorry, I couldn't understand that request. Try: 'find YC AI companies', 'draft a thread about our benchmark', 'show pending approvals', or 'what should I focus on today?'",
        intent: "unknown",
      };
    }

    const params = classified.params ?? {};

    // 3. Dispatch
    switch (classified.intent) {
      case "hunt_prospects":
        return this._huntProspects(input.workspaceId, params);

      case "draft_content":
        return this._draftContent(input.workspaceId, params);

      case "get_digest":
        return this._getDigest(input.workspaceId);

      case "list_pending":
        return this._listPending(input.workspaceId);

      case "send_touch":
        return this._sendTouch(params);

      default:
        return {
          text: [
            "I can help with:",
            "• **Hunt prospects** — 'find YC W25 AI agent companies', 'search Reddit for teams using LangChain'",
            "• **Draft content** — 'draft a Twitter thread about our benchmark', 'write a Reddit post about memory for agents'",
            "• **Digest** — 'what should I focus on today?', 'show me the dashboard'",
            "• **Pending** — 'show pending approvals', 'what touches are due today?'",
            "• **Send** — 'send touch <id>'",
          ].join("\n"),
          intent: "unknown",
        };
    }
  }

  // -------------------------------------------------------------------------
  // Intent handlers
  // -------------------------------------------------------------------------

  private async _huntProspects(
    workspaceId: string,
    params: Record<string, unknown>,
  ): Promise<ChatAgentResponse> {
    const source = String(params.source ?? "yc").toLowerCase();
    const query = String(params.query ?? "");
    const maxResults = Math.min(Number(params.maxResults ?? 10), 20);

    let result: { documents: unknown[]; ingested: unknown[] };
    let label = source;

    try {
      if (source === "yc" || source === "ycombinator" || source === "y_combinator") {
        label = "YCombinator";
        result = await this.options.research.syncYCombinator({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: true,
        });
      } else if (source === "github") {
        label = "GitHub";
        result = await this.options.research.syncGitHub({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: false,
        });
      } else if (source === "x" || source === "twitter") {
        label = "X/Twitter";
        if (!this.options.config.xBearerToken) {
          return { text: "X bearer token not configured. Set X_BEARER_TOKEN to enable X search.", intent: "hunt_prospects" };
        }
        result = await this.options.research.syncX({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: false,
        });
      } else if (source === "reddit") {
        label = "Reddit";
        result = await this.options.research.syncReddit({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: false,
        });
      } else if (source === "hn" || source === "hacker_news" || source === "hackernews") {
        label = "Hacker News";
        result = await this.options.research.syncHackerNews({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: false,
        });
      } else {
        // Default to YC
        label = "YCombinator";
        result = await this.options.research.syncYCombinator({
          workspaceId,
          query: query || "ai agent",
          maxResults,
          autoGenerateSequence: true,
        });
      }
    } catch (err) {
      return {
        text: `Failed to search ${label}: ${(err as Error).message}`,
        intent: "hunt_prospects",
      };
    }

    const count = result.ingested.length;
    return {
      text: `Found and ingested **${count} signal(s)** from ${label}${query ? ` matching "${query}"` : ""}. Sequences auto-generated where ICP match is strong enough. Check **Pending Approvals** to review.`,
      intent: "hunt_prospects",
      data: { source: label, query, ingested: count },
    };
  }

  private async _draftContent(
    workspaceId: string,
    params: Record<string, unknown>,
  ): Promise<ChatAgentResponse> {
    const platform = String(params.platform ?? "x_thread").toLowerCase();
    const topic = String(params.topic ?? params.context ?? "our product");
    const context = params.context ? String(params.context) : undefined;

    // Resolve platform alias
    const resolvedPlatform: "x_thread" | "reddit_post" | "newsletter_pitch" | "hn_comment" =
      platform.includes("reddit") ? "reddit_post" :
      platform.includes("newsletter") || platform.includes("email") ? "newsletter_pitch" :
      platform.includes("hn") || platform.includes("hacker") ? "hn_comment" :
      "x_thread";

    // Load workspace + brand + claims
    const workspace = await this.options.store.findWorkspaceById(workspaceId).catch(() => null);
    if (!workspace) {
      return { text: `Workspace ${workspaceId} not found.`, intent: "draft_content" };
    }

    const brand = await this.options.store.findBrandById(workspace.brandId).catch(() => null);
    if (!brand) {
      return { text: "Brand not found for this workspace.", intent: "draft_content" };
    }

    const allClaims = await this.options.store.listClaimsByBrand(workspace.brandId).catch(() => []);
    const approvedClaims = allClaims.filter((c) => c.status === "verified");

    if (resolvedPlatform === "hn_comment") {
      const draft = await runHnCommentWorker({
        llm: this.options.llm,
        brand,
        threadTitle: topic,
        threadContent: context ?? topic,
        threadUrl: "",
        claims: approvedClaims,
      });
      if (!draft) return { text: "LLM is disabled.", intent: "draft_content" };
      return {
        text: [
          `**HN Comment Draft** (post manually):`,
          "",
          draft.comment,
          "",
          `_Why comment: ${draft.threadRelevanceReason}_`,
        ].join("\n"),
        intent: "draft_content",
        data: draft,
      };
    }

    const draft = await runContentDistributionWorker({
      llm: this.options.llm,
      brand,
      workspace,
      claims: approvedClaims,
      topic,
      context,
      platform: resolvedPlatform,
    });

    if (!draft) return { text: "LLM is disabled.", intent: "draft_content" };

    let text: string;
    if (resolvedPlatform === "x_thread") {
      const d = draft as { tweets?: string[]; hashtags?: string[] };
      const tweets = d.tweets ?? [];
      text = [
        `**X/Twitter Thread Draft** (${tweets.length} tweets):`,
        "",
        tweets.map((t, i) => `${i + 1}. ${t}`).join("\n\n"),
        "",
        d.hashtags && d.hashtags.length > 0 ? `Hashtags: ${d.hashtags.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else if (resolvedPlatform === "reddit_post") {
      const d = draft as { title?: string; body?: string; suggestedSubreddits?: string[] };
      text = [
        `**Reddit Post Draft**`,
        `Title: ${d.title}`,
        "",
        d.body,
        "",
        d.suggestedSubreddits ? `Suggested subreddits: ${d.suggestedSubreddits.map((s) => `r/${s}`).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      const d = draft as { subject?: string; body?: string; targetNewsletter?: string };
      text = [
        `**Newsletter Pitch Draft**`,
        `Subject: ${d.subject}`,
        "",
        d.body,
        "",
        d.targetNewsletter ? `Target: ${d.targetNewsletter}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return { text, intent: "draft_content", data: draft };
  }

  private async _getDigest(workspaceId: string): Promise<ChatAgentResponse> {
    let dashboard: Awaited<ReturnType<typeof this.options.operator.getWorkspaceDashboard>>;
    try {
      dashboard = await this.options.operator.getWorkspaceDashboard(workspaceId);
    } catch (err) {
      return { text: `Could not load dashboard: ${(err as Error).message}`, intent: "get_digest" };
    }

    const pendingApprovals = dashboard.approvals?.filter(
      (a) => a.touch.status === "review_required" || a.touch.status === "needs_revision",
    ) ?? [];
    const readyToSend = dashboard.approvals?.filter((a) => a.touch.status === "approved") ?? [];
    const hotOpps = (dashboard.today ?? []).slice(0, 5);

    const lines = [
      `**Workspace: ${dashboard.workspace?.name ?? workspaceId}**`,
      `ICP: ${dashboard.workspace?.primaryIcp ?? "not set"}`,
      "",
      `**Today's focus:**`,
      readyToSend.length > 0
        ? `• ${readyToSend.length} approved touch(es) ready to send`
        : "• No touches ready to send",
      pendingApprovals.length > 0
        ? `• ${pendingApprovals.length} touch(es) awaiting your review`
        : "• No touches pending review",
      hotOpps.length > 0
        ? `• ${hotOpps.length} opportunity(ies) in today's queue`
        : "• No new opportunities in queue",
    ];

    if (hotOpps.length > 0) {
      lines.push("", "**Opportunities to work on today:**");
      for (const opp of hotOpps) {
        lines.push(`• ${opp.reason}`);
      }
    }

    return {
      text: lines.join("\n"),
      intent: "get_digest",
      data: {
        pendingCount: pendingApprovals.length,
        approvedCount: readyToSend.length,
        todayCount: hotOpps.length,
      },
    };
  }

  private async _listPending(workspaceId: string): Promise<ChatAgentResponse> {
    const allTouches = await this.options.store.listTouchesByWorkspace(workspaceId).catch(() => []);
    const pending = allTouches
      .filter((t) => t.status === "review_required" || t.status === "needs_revision")
      .slice(0, 20);
    const approved = allTouches.filter((t) => t.status === "approved").slice(0, 20);

    const lines: string[] = [];

    if (pending.length === 0 && approved.length === 0) {
      return { text: "No pending or approved touches at the moment.", intent: "list_pending" };
    }

    if (approved.length > 0) {
      lines.push(`**${approved.length} touch(es) approved and ready to send:**`);
      for (const t of approved) {
        const scheduled = t.metadata?.scheduledFor ? ` (scheduled: ${t.metadata.scheduledFor})` : "";
        lines.push(`• \`${t.id}\` — ${t.touchType}${scheduled}: ${(t.title || t.body).slice(0, 80)}`);
      }
    }

    if (pending.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`**${pending.length} touch(es) awaiting review:**`);
      for (const t of pending) {
        lines.push(`• \`${t.id}\` — ${t.touchType}: ${(t.title || t.body).slice(0, 80)}`);
      }
    }

    lines.push("", 'To send an approved touch: say "send touch <id>"');

    return {
      text: lines.join("\n"),
      intent: "list_pending",
      data: { pending: pending.map((t) => t.id), approved: approved.map((t) => t.id) },
    };
  }

  private async _sendTouch(params: Record<string, unknown>): Promise<ChatAgentResponse> {
    const touchId = String(params.touchId ?? "").trim();
    if (!touchId) {
      return {
        text: 'Specify a touch ID, e.g. "send touch abc123".',
        intent: "send_touch",
      };
    }

    const touch = await this.options.store.findTouchById(touchId).catch(() => null);
    if (!touch) {
      return { text: `Touch \`${touchId}\` not found.`, intent: "send_touch" };
    }
    if (touch.status !== "approved") {
      return {
        text: `Touch \`${touchId}\` is in status "${touch.status}" — only approved touches can be sent.`,
        intent: "send_touch",
      };
    }

    if (touch.touchType === "email" || touch.touchType === "follow_up") {
      if (!this.options.config.resendApiKey || !this.options.config.resendFromAddress) {
        return { text: "Email sending not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS.", intent: "send_touch" };
      }
      try {
        const result = await this.options.operator.sendApprovedEmailTouch({
          touchId,
          resendApiKey: this.options.config.resendApiKey,
          resendFromAddress: this.options.config.resendFromAddress,
          resendFromName: this.options.config.resendFromName,
          githubToken: this.options.config.githubToken,
          hunterApiKey: this.options.config.hunterApiKey,
        });
        return {
          text: result.sent
            ? `Email touch \`${touchId}\` sent successfully.`
            : `Email touch \`${touchId}\` could not be sent: ${result.reason}.`,
          intent: "send_touch",
          data: result,
        };
      } catch (err) {
        return { text: `Failed to send touch: ${(err as Error).message}`, intent: "send_touch" };
      }
    }

    if (touch.touchType === "post" || touch.touchType === "public_reply" || touch.touchType === "dm") {
      if (!this.options.config.xAccessToken) {
        return { text: "X access token not configured. Set X_ACCESS_TOKEN to enable X posting.", intent: "send_touch" };
      }
      try {
        const result = await this.options.operator.sendApprovedXTouch({
          touchId,
          xAccessToken: this.options.config.xAccessToken,
          oauthClientId: this.options.config.xOauthClientId,
          oauthClientSecret: this.options.config.xOauthClientSecret,
        });
        return {
          text: result.sent
            ? `X touch \`${touchId}\` posted${result.postUrl ? `: ${result.postUrl}` : ""}.`
            : `X touch \`${touchId}\` failed: ${result.reason}.`,
          intent: "send_touch",
          data: result,
        };
      } catch (err) {
        return { text: `Failed to send X touch: ${(err as Error).message}`, intent: "send_touch" };
      }
    }

    if (touch.touchType === "community_post") {
      const bearerToken = this.options.config.redditBearerToken;
      if (!bearerToken) {
        return { text: "Reddit bearer token not configured. Set REDDIT_BEARER_TOKEN.", intent: "send_touch" };
      }
      try {
        const result = await this.options.operator.sendApprovedRedditTouch({
          touchId,
          redditBearerToken: bearerToken,
          userAgent: this.options.config.researchHttpUserAgent,
          redditClientId: this.options.config.redditClientId,
          redditClientSecret: this.options.config.redditClientSecret,
        });
        return {
          text: result.sent
            ? `Reddit touch \`${touchId}\` submitted${result.postUrl ? `: ${result.postUrl}` : ""}.`
            : `Reddit touch \`${touchId}\` failed: ${result.reason}.`,
          intent: "send_touch",
          data: result,
        };
      } catch (err) {
        return { text: `Failed to send Reddit touch: ${(err as Error).message}`, intent: "send_touch" };
      }
    }

    return {
      text: `Touch \`${touchId}\` is type "${touch.touchType}" — manual posting required.`,
      intent: "send_touch",
    };
  }
}
