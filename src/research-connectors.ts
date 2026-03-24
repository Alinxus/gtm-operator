import { createSign } from "node:crypto";
import type { ChannelType, SignalSource } from "./domain.js";
import { createId } from "./domain.js";
import type { GtmOperator } from "./gtm-operator.js";

export interface ExternalResearchDocument {
  id: string;
  source: SignalSource | "website";
  title: string;
  content: string;
  excerpt: string;
  url?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  metadata: Record<string, unknown>;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "Untitled";
}

function htmlLinks(baseUrl: string, html: string) {
  const links = new Set<string>();
  const matches = html.matchAll(/href=["']([^"'#]+)["']/gi);
  for (const match of matches) {
    const value = match[1];
    if (!value) continue;
    try {
      const url = new URL(value, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        links.add(url.toString());
      }
    } catch {
      continue;
    }
  }
  return [...links];
}

function excerpt(content: string, max = 360) {
  return content.length > max ? `${content.slice(0, max).trim()}...` : content;
}

function slugToName(input: string) {
  return input
    .replace(/^www\./i, "")
    .replace(/\.[a-z]{2,}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function hostnameName(url: string) {
  try {
    return slugToName(new URL(url).hostname);
  } catch {
    return "Unknown";
  }
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function repoFromGitHubInput(input: { query?: string; repo?: string }) {
  const explicit = input.repo?.trim();
  if (explicit) return explicit;

  const match = input.query?.match(/\brepo:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  return match?.[1] ?? null;
}

function pathTitle(url: string) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
    return slugToName(last);
  } catch {
    return "External page";
  }
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function queryTerms(query: string) {
  return normalizeSearchText(query)
    .split(" ")
    .filter((term) => term.length >= 3);
}

function normalizeSearchText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(input: { query: string; text: string }) {
  const terms = queryTerms(input.query);
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(input.text);
  const matched = terms.filter((term) => haystack.includes(term));
  return matched.length >= Math.min(2, terms.length) || matched.length / terms.length >= 0.5;
}

function guessChannelsFromSource(source: ExternalResearchDocument["source"]): ChannelType[] {
  switch (source) {
    case "x":
      return ["reply", "social", "landing"];
    case "linkedin":
      return ["reply", "outbound", "landing"];
    case "github":
      return ["outbound", "partnership", "landing"];
    case "y_combinator":
      return ["outbound", "landing", "reply"];
    case "docs":
    case "website":
      return ["landing", "outbound", "seo"];
    case "form":
      return ["outbound", "landing"];
    case "product":
      return ["outbound", "landing"];
    case "reddit":
    case "hacker_news":
      return ["community", "reply", "landing"];
    case "crm":
    case "manual":
    default:
      return ["outbound", "landing"];
  }
}

async function fetchText(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function trimContent(value: string, max = 5000) {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function looksSparse(content: string) {
  return content.trim().length < 220;
}

function browserRenderingHeaders(apiToken: string, userAgent: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
    "User-Agent": userAgent,
  };
}

export class OpenAIWebSearchResearchConnector {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async sync(input: { query: string; maxResults?: number }) {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        tools: [
          {
            type: "web_search",
            search_context_size: input.maxResults && input.maxResults <= 5 ? "low" : "medium",
          },
        ],
        input: `Search the public web for: ${input.query}\n\nReturn a compact synthesis with citations.`,
        max_output_tokens: 900,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI web search failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      output?: Array<{
        type?: string;
        content?: Array<{
          type?: string;
          text?: string;
          annotations?: Array<{
            type?: string;
            title?: string;
            url?: string;
            start_index?: number;
            end_index?: number;
          }>;
        }>;
      }>;
    };

    const message = (payload.output ?? []).find((item) => item.type === "message");
    const parts = Array.isArray(message?.content) ? message!.content : [];
    const textPart = parts.find((part) => part.type === "output_text");
    const text = typeof textPart?.text === "string" ? textPart.text : "";
    const annotations = Array.isArray(textPart?.annotations) ? textPart.annotations : [];

    const documents = annotations
      .filter((annotation) => annotation?.type === "url_citation" && typeof annotation.url === "string")
      .map((annotation) => {
        const start = typeof annotation.start_index === "number" ? annotation.start_index : 0;
        const end = typeof annotation.end_index === "number" ? annotation.end_index : Math.min(text.length, start + 240);
        const citedSnippet = text.slice(start, end).trim() || text;
        return {
          id: createId("doc"),
          source: "manual" as const,
          title: annotation.title?.trim() || pathTitle(annotation.url!),
          content: trimContent(text || citedSnippet),
          excerpt: excerpt(citedSnippet || text),
          url: annotation.url,
          author: "OpenAI web search",
          publishedAt: null,
          metadata: {
            sourceQuery: input.query,
            connectorSource: "openai_web_search",
          },
        } satisfies ExternalResearchDocument;
      });

    return documents.slice(0, input.maxResults ?? 8);
  }
}

export class CloudflareBrowserRenderingClient {
  constructor(
    private readonly options: {
      accountId: string;
      apiToken: string;
      userAgent: string;
    },
  ) {}

  async markdown(url: string) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.options.accountId}/browser-rendering/markdown`,
      {
        method: "POST",
        headers: {
          ...browserRenderingHeaders(this.options.apiToken, this.options.userAgent),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      },
    );

    if (!response.ok) {
      throw new Error(`Cloudflare Browser Rendering markdown failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          result?: {
            markdown?: string;
          };
        }
      | null;
    const markdown = payload?.result?.markdown;
    if (typeof markdown === "string" && markdown.trim().length > 0) {
      return markdown;
    }

    const fallback = await response.text().catch(() => "");
    if (!fallback.trim()) {
      throw new Error("Cloudflare Browser Rendering returned no markdown.");
    }
    return fallback;
  }
}

export class WebsiteResearchConnector {
  constructor(
    private readonly options: {
      userAgent: string;
      browserRenderer?: CloudflareBrowserRenderingClient;
    },
  ) {}

  async sync(input: { urls: string[]; maxPages?: number; maxDepth?: number; source?: "docs" | "website" }) {
    const maxPages = Math.max(1, Math.min(25, input.maxPages ?? 8));
    const maxDepth = Math.max(0, Math.min(3, input.maxDepth ?? 1));
    const queue = input.urls.map((url) => ({ url, depth: 0 }));
    const seen = new Set<string>();
    const documents: ExternalResearchDocument[] = [];

    while (queue.length > 0 && documents.length < maxPages) {
      const current = queue.shift();
      if (!current || seen.has(current.url)) continue;
      seen.add(current.url);

      try {
        const html = await fetchText(current.url, { "User-Agent": this.options.userAgent });
        const title = htmlTitle(html) || pathTitle(current.url);
        let content = trimContent(stripHtml(html));
        if (this.options.browserRenderer && looksSparse(content)) {
          const renderedMarkdown = await this.options.browserRenderer.markdown(current.url).catch(() => null);
          if (typeof renderedMarkdown === "string" && renderedMarkdown.trim().length > 0) {
            content = trimContent(renderedMarkdown);
          }
        }
        if (!content) continue;

        documents.push({
          id: createId("doc"),
          source: input.source ?? "website",
          title,
          content,
          excerpt: excerpt(content),
          url: current.url,
          author: null,
          publishedAt: null,
          metadata: {
            hostname: new URL(current.url).hostname,
            depth: current.depth,
          },
        });

        if (current.depth < maxDepth) {
          const rootHost = new URL(current.url).hostname;
          for (const link of htmlLinks(current.url, html)) {
            try {
              const parsed = new URL(link);
              if (parsed.hostname === rootHost && !seen.has(link)) {
                queue.push({ url: link, depth: current.depth + 1 });
              }
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }

    return documents;
  }
}

export class GitHubResearchConnector {
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly options: {
      token?: string;
      appId?: string;
      privateKey?: string;
      installationId?: string;
      userAgent: string;
    },
  ) {}

  private githubHeaders(token?: string) {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": this.options.userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private createAppJwt() {
    if (!this.options.appId || !this.options.privateKey) {
      throw new Error("GitHub App auth requires GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.");
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iat: now - 60,
        exp: now + 540,
        iss: this.options.appId,
      }),
    ).toString("base64url");
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(this.options.privateKey).toString("base64url");
    return `${unsignedToken}.${signature}`;
  }

  private async resolveInstallationId(appJwt: string, input: { query?: string; repo?: string }) {
    if (this.options.installationId) {
      return this.options.installationId;
    }

    const repo = repoFromGitHubInput(input);
    if (repo) {
      const repoResponse = await fetch(`https://api.github.com/repos/${repo}/installation`, {
        headers: this.githubHeaders(appJwt),
      });
      if (repoResponse.ok) {
        const payload = (await repoResponse.json()) as { id?: number | string };
        if (payload.id) return String(payload.id);
      }
    }

    const installationsResponse = await fetch("https://api.github.com/app/installations?per_page=100", {
      headers: this.githubHeaders(appJwt),
    });
    if (!installationsResponse.ok) {
      return undefined;
    }

    const payload = (await installationsResponse.json()) as Array<{ id?: number | string }>;
    const installationId = payload.find((installation) => installation.id)?.id;
    return installationId ? String(installationId) : undefined;
  }

  private async resolveInstallationToken(input: { query?: string; repo?: string }) {
    if (this.options.token) {
      return this.options.token;
    }

    if (!this.options.appId || !this.options.privateKey) {
      return undefined;
    }

    const appJwt = this.createAppJwt();
    const installationId = await this.resolveInstallationId(appJwt, input);
    if (!installationId) {
      return undefined;
    }

    const cached = this.tokenCache.get(installationId);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60_000) {
      return cached.token;
    }

    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        ...this.githubHeaders(appJwt),
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { token?: string; expires_at?: string };
    if (!payload.token) {
      return undefined;
    }

    const expiresAt = payload.expires_at ? new Date(payload.expires_at).getTime() : now + 50 * 60_000;
    this.tokenCache.set(installationId, { token: payload.token, expiresAt });
    return payload.token;
  }

  async sync(input: { query?: string; repo?: string; maxResults?: number }) {
    const maxResults = Math.max(1, Math.min(20, input.maxResults ?? 8));
    const query = input.query?.trim() || (input.repo ? `repo:${input.repo} is:issue` : "");
    if (!query) {
      throw new Error("GitHub sync requires a query or repo.");
    }

    const params = new URLSearchParams({
      q: query,
      per_page: String(maxResults),
      sort: "updated",
      order: "desc",
    });
    const token = await this.resolveInstallationToken(input);

    const response = await fetch(`https://api.github.com/search/issues?${params.toString()}`, {
      headers: this.githubHeaders(token),
    });

    if (!response.ok) {
      throw new Error(`GitHub sync failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map((item) => {
      const title = typeof item.title === "string" ? item.title : "GitHub thread";
      const body = typeof item.body === "string" ? item.body : "";
      const htmlUrl = typeof item.html_url === "string" ? item.html_url : undefined;
      const user = typeof item.user === "object" && item.user ? (item.user as { login?: unknown }).login : undefined;
      return {
        id: createId("doc"),
        source: "github" as const,
        title,
        content: trimContent(body || title),
        excerpt: excerpt(body || title),
        url: htmlUrl,
        author: typeof user === "string" ? user : null,
        publishedAt: typeof item.updated_at === "string" ? item.updated_at : null,
        metadata: {
          repo: typeof item.repository_url === "string" ? item.repository_url : input.repo ?? null,
          state: typeof item.state === "string" ? item.state : null,
          labels: Array.isArray(item.labels)
            ? item.labels
                .map((label) => (typeof label === "object" && label ? (label as { name?: unknown }).name : null))
                .filter((label): label is string => typeof label === "string")
            : [],
        },
      } satisfies ExternalResearchDocument;
    });
  }
}

export class XResearchConnector {
  constructor(
    private readonly options: {
      bearerToken?: string;
    },
  ) {}

  async sync(input: { query: string; maxResults?: number }) {
    if (!this.options.bearerToken) {
      throw new Error("X sync requires X_BEARER_TOKEN.");
    }

    const maxResults = Math.max(10, Math.min(50, input.maxResults ?? 10));
    const params = new URLSearchParams({
      query: input.query,
      max_results: String(maxResults),
      expansions: "author_id",
      "tweet.fields": "created_at,public_metrics,conversation_id",
      "user.fields": "name,username,public_metrics",
    });

    const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.options.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`X sync failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      includes?: { users?: Array<Record<string, unknown>> };
    };
    const users = new Map(
      (payload.includes?.users ?? []).map((user) => [
        String(user.id),
        {
          name: typeof user.name === "string" ? user.name : null,
          username: typeof user.username === "string" ? user.username : null,
        },
      ]),
    );

    return (payload.data ?? []).map((tweet) => {
      const author = users.get(String(tweet.author_id));
      const text = typeof tweet.text === "string" ? tweet.text : "";
      const username = author?.username ?? "unknown";
      const id = typeof tweet.id === "string" ? tweet.id : createId("tweet");
      return {
        id: createId("doc"),
        source: "x" as const,
        title: `X: ${text.slice(0, 80)}`,
        content: trimContent(text),
        excerpt: excerpt(text),
        url: `https://x.com/${username}/status/${id}`,
        author: author?.name ?? username,
        publishedAt: typeof tweet.created_at === "string" ? tweet.created_at : null,
        metadata: {
          username,
          publicMetrics: typeof tweet.public_metrics === "object" ? tweet.public_metrics : {},
        },
      } satisfies ExternalResearchDocument;
    });
  }
}

export class LinkedInResearchConnector {
  constructor(
    private readonly options: {
      userAgent: string;
      accessToken?: string;
      browserRenderer?: CloudflareBrowserRenderingClient;
    },
  ) {}

  async sync(input: { urls: string[] }) {
    const documents: ExternalResearchDocument[] = [];
    for (const url of input.urls) {
      const renderedMarkdown = this.options.browserRenderer ? await this.options.browserRenderer.markdown(url).catch(() => null) : null;
      const html =
        renderedMarkdown === null
          ? await fetchText(url, {
              "User-Agent": this.options.userAgent,
              ...(this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : {}),
            })
          : null;
      const title = html ? htmlTitle(html) || pathTitle(url) : pathTitle(url);
      const content = trimContent(renderedMarkdown ?? stripHtml(html ?? ""));
      if (!content) continue;

      documents.push({
        id: createId("doc"),
        source: "linkedin",
        title,
        content,
        excerpt: excerpt(content),
        url,
        author: null,
        publishedAt: null,
        metadata: {
          mode: "public-url",
          rendered: renderedMarkdown !== null,
        },
      });
    }
    return documents;
  }
}

export class RedditResearchConnector {
  constructor(
    private readonly options: {
      bearerToken?: string;
      userAgent: string;
    },
  ) {}

  private async syncViaOauth(input: { query: string; subreddit?: string; maxResults: number }) {
    if (!this.options.bearerToken) {
      throw new Error("Missing REDDIT_BEARER_TOKEN.");
    }

    const query = input.subreddit ? `subreddit:${input.subreddit} ${input.query}` : input.query;
    const params = new URLSearchParams({
      q: query,
      sort: "new",
      limit: String(input.maxResults),
      raw_json: "1",
      type: "link",
    });

    const response = await fetch(`https://oauth.reddit.com/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.options.bearerToken}`,
        "User-Agent": this.options.userAgent,
      },
    });
    if (!response.ok) {
      throw new Error(`Reddit OAuth sync failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: {
        children?: Array<{
          data?: Record<string, unknown>;
        }>;
      };
    };

    return this.mapRedditListing(payload.data?.children ?? [], input.query, "oauth");
  }

  private mapRedditListing(
    children: Array<{ data?: Record<string, unknown> }>,
    sourceQuery: string,
    mode: "oauth" | "public-json" | "public-rss",
  ) {
    return children
      .map((item) => item.data ?? {})
      .map((post) => {
        const title = typeof post.title === "string" ? post.title : "Reddit thread";
        const body = typeof post.selftext === "string" ? post.selftext : "";
        const subreddit = typeof post.subreddit === "string" ? post.subreddit : null;
        const permalink = typeof post.permalink === "string" ? post.permalink : null;
        const content = trimContent([title, body].filter(Boolean).join("\n\n"));
        return {
          id: createId("doc"),
          source: "reddit" as const,
          title: subreddit ? `Reddit r/${subreddit}: ${title}` : `Reddit: ${title}`,
          content,
          excerpt: excerpt(content),
          url: permalink ? `https://www.reddit.com${permalink}` : null,
          author: typeof post.author === "string" ? post.author : null,
          publishedAt:
            typeof post.created_utc === "number" ? new Date(post.created_utc * 1000).toISOString() : null,
          metadata: {
            subreddit,
            score: typeof post.score === "number" ? post.score : null,
            comments: typeof post.num_comments === "number" ? post.num_comments : null,
            postHint: typeof post.post_hint === "string" ? post.post_hint : null,
            sourceQuery,
            mode,
          },
        } satisfies ExternalResearchDocument;
      });
  }

  private async syncViaPublicJson(input: { query: string; subreddit?: string; maxResults: number }) {
    const params = new URLSearchParams({
      q: input.query,
      sort: "new",
      limit: String(input.maxResults),
      raw_json: "1",
      type: "link",
      ...(input.subreddit ? { restrict_sr: "1" } : {}),
    });
    const baseUrl = input.subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(input.subreddit)}/search.json`
      : "https://www.reddit.com/search.json";
    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        "User-Agent": this.options.userAgent,
      },
    });
    if (!response.ok) {
      throw new Error(`Reddit public JSON sync failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: {
        children?: Array<{
          data?: Record<string, unknown>;
        }>;
      };
    };

    return this.mapRedditListing(payload.data?.children ?? [], input.query, "public-json");
  }

  private parseRssTag(block: string, tag: string) {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() ?? null;
  }

  private async syncViaPublicRss(input: { query: string; subreddit?: string; maxResults: number }) {
    const params = new URLSearchParams({
      q: input.query,
      sort: "new",
      limit: String(input.maxResults),
      ...(input.subreddit ? { restrict_sr: "1" } : {}),
    });
    const baseUrl = input.subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(input.subreddit)}/search.rss`
      : "https://www.reddit.com/search.rss";
    const xml = await fetchText(`${baseUrl}?${params.toString()}`, {
      "User-Agent": this.options.userAgent,
    });

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
    return items.map((item) => {
      const title = stripHtml(this.parseRssTag(item, "title") ?? "Reddit thread");
      const link = this.parseRssTag(item, "link");
      const description = stripHtml(this.parseRssTag(item, "description") ?? "");
      const creator = this.parseRssTag(item, "dc:creator") ?? this.parseRssTag(item, "author");
      const subredditMatch = link?.match(/reddit\.com\/r\/([^/]+)/i);
      const subreddit = subredditMatch?.[1] ?? null;
      const content = trimContent([title, description].filter(Boolean).join("\n\n"));
      return {
        id: createId("doc"),
        source: "reddit" as const,
        title: subreddit ? `Reddit r/${subreddit}: ${title}` : `Reddit: ${title}`,
        content,
        excerpt: excerpt(content),
        url: link,
        author: creator,
        publishedAt: this.parseRssTag(item, "pubDate"),
        metadata: {
          subreddit,
          sourceQuery: input.query,
          mode: "public-rss",
        },
      } satisfies ExternalResearchDocument;
    });
  }

  async sync(input: { query: string; subreddit?: string; maxResults?: number }) {
    const maxResults = Math.max(1, Math.min(25, input.maxResults ?? 8));
    if (this.options.bearerToken) {
      try {
        return await this.syncViaOauth({ ...input, maxResults });
      } catch {
        // Fall through to public endpoints so the connector still works in low-cost setups.
      }
    }

    try {
      return await this.syncViaPublicJson({ ...input, maxResults });
    } catch {
      return this.syncViaPublicRss({ ...input, maxResults });
    }
  }
}

export class HackerNewsResearchConnector {
  async sync(input: { query: string; storyType?: "top" | "new" | "ask" | "show"; maxResults?: number; scanLimit?: number }) {
    const storyType = input.storyType ?? "ask";
    const maxResults = Math.max(1, Math.min(20, input.maxResults ?? 8));
    const scanLimit = Math.max(maxResults, Math.min(100, input.scanLimit ?? Math.max(40, maxResults * 5)));
    const endpoint =
      storyType === "top"
        ? "topstories"
        : storyType === "new"
          ? "newstories"
          : storyType === "show"
            ? "showstories"
            : "askstories";

    const idResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`);
    if (!idResponse.ok) {
      throw new Error(`Hacker News sync failed: ${idResponse.status} ${idResponse.statusText}`);
    }

    const ids = ((await idResponse.json()) as number[]).slice(0, scanLimit);
    const documents: ExternalResearchDocument[] = [];

    for (const id of ids) {
      if (documents.length >= maxResults) break;
      const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!itemResponse.ok) continue;

      const item = (await itemResponse.json()) as Record<string, unknown> | null;
      if (!item || item.deleted === true || item.dead === true || item.type !== "story") continue;

      const title = typeof item.title === "string" ? item.title : "Hacker News story";
      const text = typeof item.text === "string" ? stripHtml(item.text) : "";
      const url = typeof item.url === "string" ? item.url : `https://news.ycombinator.com/item?id=${id}`;
      const content = trimContent([title, text, url].filter(Boolean).join("\n\n"));
      if (!matchesQuery({ query: input.query, text: content })) continue;

      documents.push({
        id: createId("doc"),
        source: "hacker_news",
        title: `HN: ${title}`,
        content,
        excerpt: excerpt(content),
        url,
        author: typeof item.by === "string" ? item.by : null,
        publishedAt: typeof item.time === "number" ? new Date(item.time * 1000).toISOString() : null,
        metadata: {
          hnId: id,
          storyType,
          score: typeof item.score === "number" ? item.score : null,
          comments: typeof item.descendants === "number" ? item.descendants : null,
          sourceQuery: input.query,
        },
      });
    }

    return documents;
  }
}

interface YcAlgoliaOptions {
  app: string;
  key: string;
}

function extractYcAlgoliaOptions(html: string): YcAlgoliaOptions {
  const match = html.match(/window\.AlgoliaOpts\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) {
    throw new Error("Could not find YC search configuration on the directory page.");
  }

  const parsed = JSON.parse(match[1]) as Record<string, unknown>;
  const app = typeof parsed.app === "string" ? parsed.app : null;
  const key = typeof parsed.key === "string" ? parsed.key : null;
  if (!app || !key) {
    throw new Error("YC search configuration is missing app/key.");
  }

  return { app, key };
}

export class YCombinatorResearchConnector {
  constructor(
    private readonly options: {
      userAgent: string;
    },
  ) {}

  async sync(input: { query: string; batch?: string; maxResults?: number }) {
    const maxResults = Math.max(1, Math.min(20, input.maxResults ?? 8));
    // Extract YC batch token (e.g. W25, S24) from query string if not provided explicitly
    let query = input.query;
    let batch = input.batch;
    if (!batch) {
      const batchMatch = query.match(/\b([WSFwsf]\d{2})\b/);
      if (batchMatch) {
        batch = batchMatch[1].toUpperCase();
        query = query.replace(batchMatch[0], "").replace(/\s+/g, " ").trim();
      }
    }
    const directoryHtml = await fetchText(`https://www.ycombinator.com/companies?query=${encodeURIComponent(query)}`, {
      "User-Agent": this.options.userAgent,
    });
    const algolia = extractYcAlgoliaOptions(directoryHtml);
    const algoliaParams: Record<string, string> = { query, hitsPerPage: String(maxResults) };
    if (batch) algoliaParams.facetFilters = JSON.stringify([`batch:${batch}`]);
    const response = await fetch(`https://${algolia.app}-dsn.algolia.net/1/indexes/*/queries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": algolia.app,
        "X-Algolia-API-Key": algolia.key,
        "User-Agent": this.options.userAgent,
      },
      body: JSON.stringify({
        requests: [
          {
            indexName: "YCCompany_production",
            params: new URLSearchParams(algoliaParams).toString(),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`YC sync failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      results?: Array<{
        hits?: Array<Record<string, unknown>>;
      }>;
    };
    const hits = payload.results?.[0]?.hits ?? [];

    return hits.map((company) => {
      const name = typeof company.name === "string" ? company.name : "YC company";
      const slug = typeof company.slug === "string" ? company.slug : null;
      const companyWebsite = typeof company.website === "string" ? company.website : null;
      const oneLiner = typeof company.one_liner === "string" ? company.one_liner : "";
      const longDescription = typeof company.long_description === "string" ? company.long_description : "";
      const batch = typeof company.batch === "string" ? company.batch : null;
      const location = typeof company.all_locations === "string" ? company.all_locations : null;
      const content = trimContent(
        [
          oneLiner,
          longDescription,
          batch ? `YC batch: ${batch}` : "",
          location ? `Location: ${location}` : "",
          companyWebsite ? `Company website: ${companyWebsite}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
      return {
        id: createId("doc"),
        source: "y_combinator" as const,
        title: `YC: ${name}`,
        content,
        excerpt: excerpt(content),
        url: slug ? `https://www.ycombinator.com/companies/${slug}` : "https://www.ycombinator.com/companies",
        author: null,
        publishedAt:
          typeof company.launched_at === "number" ? new Date(company.launched_at * 1000).toISOString() : null,
        metadata: {
          accountName: name,
          accountDomain: companyWebsite ? domainFromUrl(companyWebsite) : null,
          companyWebsite,
          batch,
          location,
          industry: typeof company.industry === "string" ? company.industry : null,
          subindustry: typeof company.subindustry === "string" ? company.subindustry : null,
          stage: typeof company.stage === "string" ? company.stage : null,
          tags: Array.isArray(company.tags) ? company.tags.filter((tag): tag is string => typeof tag === "string") : [],
          sourceQuery: input.query,
        },
      } satisfies ExternalResearchDocument;
    });
  }
}

export class ResearchCoordinator {
  private readonly websiteConnector: WebsiteResearchConnector;
  private readonly githubConnector: GitHubResearchConnector;
  private readonly xConnector: XResearchConnector;
  private readonly linkedinConnector: LinkedInResearchConnector;
  private readonly openAiWebSearchConnector?: OpenAIWebSearchResearchConnector;
  private readonly redditConnector: RedditResearchConnector;
  private readonly hackerNewsConnector: HackerNewsResearchConnector;
  private readonly yCombinatorConnector: YCombinatorResearchConnector;
  private readonly browserRenderer?: CloudflareBrowserRenderingClient;

  constructor(
    private readonly options: {
      operator: GtmOperator;
      userAgent: string;
      openAiApiKey?: string;
      openAiBaseUrl?: string;
      openAiModel?: string;
      githubToken?: string;
      githubAppId?: string;
      githubAppPrivateKey?: string;
      githubAppInstallationId?: string;
      cloudflareAccountId?: string;
      cloudflareApiToken?: string;
      xBearerToken?: string;
      redditBearerToken?: string;
      linkedinAccessToken?: string;
    },
  ) {
    if (options.cloudflareAccountId && options.cloudflareApiToken) {
      this.browserRenderer = new CloudflareBrowserRenderingClient({
        accountId: options.cloudflareAccountId,
        apiToken: options.cloudflareApiToken,
        userAgent: options.userAgent,
      });
    }
    this.websiteConnector = new WebsiteResearchConnector({
      userAgent: options.userAgent,
      browserRenderer: this.browserRenderer,
    });
    this.githubConnector = new GitHubResearchConnector({
      token: options.githubToken,
      appId: options.githubAppId,
      privateKey: options.githubAppPrivateKey,
      installationId: options.githubAppInstallationId,
      userAgent: options.userAgent,
    });
    this.xConnector = new XResearchConnector({
      bearerToken: options.xBearerToken,
    });
    this.redditConnector = new RedditResearchConnector({
      bearerToken: options.redditBearerToken,
      userAgent: options.userAgent,
    });
    this.linkedinConnector = new LinkedInResearchConnector({
      userAgent: options.userAgent,
      accessToken: options.linkedinAccessToken,
      browserRenderer: this.browserRenderer,
    });
    this.hackerNewsConnector = new HackerNewsResearchConnector();
    this.yCombinatorConnector = new YCombinatorResearchConnector({
      userAgent: options.userAgent,
    });
    if (options.openAiApiKey && options.openAiBaseUrl && options.openAiModel) {
      this.openAiWebSearchConnector = new OpenAIWebSearchResearchConnector({
        apiKey: options.openAiApiKey,
        baseUrl: options.openAiBaseUrl,
        model: options.openAiModel,
      });
    }
  }

  async syncWebsite(input: {
    workspaceId: string;
    urls: string[];
    maxPages?: number;
    maxDepth?: number;
    source?: "docs" | "website";
    accountName?: string;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.websiteConnector.sync({
      urls: input.urls,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      source: input.source,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      accountName: input.accountName,
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncGitHub(input: {
    workspaceId: string;
    query?: string;
    repo?: string;
    maxResults?: number;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.githubConnector.sync({
      query: input.query,
      repo: input.repo,
      maxResults: input.maxResults,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      accountName: input.repo ? slugToName(input.repo.split("/")[0] ?? input.repo) : undefined,
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncX(input: {
    workspaceId: string;
    query: string;
    maxResults?: number;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.xConnector.sync({
      query: input.query,
      maxResults: input.maxResults,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncLinkedIn(input: {
    workspaceId: string;
    urls: string[];
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.linkedinConnector.sync({
      urls: input.urls,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncWebSearch(input: {
    workspaceId: string;
    query: string;
    maxResults?: number;
    autoGenerateSequence?: boolean;
  }) {
    if (!this.openAiWebSearchConnector) {
      throw new Error("OpenAI web search requires OPENAI_API_KEY plus an OpenAI-enabled runtime.");
    }

    const documents = await this.openAiWebSearchConnector.sync({
      query: input.query,
      maxResults: input.maxResults,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncReddit(input: {
    workspaceId: string;
    query: string;
    subreddit?: string;
    maxResults?: number;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.redditConnector.sync({
      query: input.query,
      subreddit: input.subreddit,
      maxResults: input.maxResults,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncHackerNews(input: {
    workspaceId: string;
    query: string;
    storyType?: "top" | "new" | "ask" | "show";
    maxResults?: number;
    scanLimit?: number;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.hackerNewsConnector.sync({
      query: input.query,
      storyType: input.storyType,
      maxResults: input.maxResults,
      scanLimit: input.scanLimit,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  async syncYCombinator(input: {
    workspaceId: string;
    query: string;
    maxResults?: number;
    autoGenerateSequence?: boolean;
  }) {
    const documents = await this.yCombinatorConnector.sync({
      query: input.query,
      maxResults: input.maxResults,
    });
    return this.ingestDocuments(input.workspaceId, documents, {
      autoGenerateSequence: input.autoGenerateSequence,
    });
  }

  private async ingestDocuments(
    workspaceId: string,
    documents: ExternalResearchDocument[],
    options: {
      accountName?: string;
      autoGenerateSequence?: boolean;
    },
  ) {
    const ingested = [];
    for (const document of documents) {
      const url = document.url ?? undefined;
      const accountName =
        options.accountName ??
        metadataString(document.metadata, "accountName") ??
        (url ? hostnameName(url) : document.author ?? "External research");
      const companyWebsite = metadataString(document.metadata, "companyWebsite");
      const accountDomain =
        metadataString(document.metadata, "accountDomain") ??
        (companyWebsite
          ? domainFromUrl(companyWebsite)
          : url && document.source !== "x" && document.source !== "github" && document.source !== "linkedin"
            ? domainFromUrl(url)
            : null);

      const personName = metadataString(document.metadata, "personName") ?? document.author ?? null;
      const personRole = (
        metadataString(document.metadata, "personRole") ??
        (document.source === "github"
          ? "Builder"
          : document.source === "x" || document.source === "linkedin" || document.source === "y_combinator"
            ? "Founder"
            : "Research lead")
      ).trim();
      const socialHandle =
        metadataString(document.metadata, "socialHandle") ??
        (document.source === "x" && url ? `@${new URL(url).pathname.split("/").filter(Boolean)[0] ?? "unknown"}` : null);
      const evidenceUrls = [url, companyWebsite].filter((value): value is string => typeof value === "string" && value.length > 0);

      ingested.push(
        await this.options.operator.ingestSignal({
          workspaceId,
          source: document.source === "website" ? "docs" : document.source,
          title: document.title,
          content: document.content,
          evidenceUrls,
          account: {
            name: accountName,
            domain: accountDomain,
            summary: document.excerpt,
          },
          person: personName
            ? {
                name: personName,
                role: personRole,
                socialHandle,
              }
            : undefined,
          autoGenerateSequence: options.autoGenerateSequence,
          metadata: {
            connectorSource: document.source,
            reachableChannels: guessChannelsFromSource(document.source),
            researchDocuments: [document],
            discoveryQuery: metadataString(document.metadata, "sourceQuery") ?? null,
          },
        }),
      );
    }

    return {
      documents,
      ingested,
    };
  }
}
