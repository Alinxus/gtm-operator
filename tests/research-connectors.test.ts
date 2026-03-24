import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  CloudflareBrowserRenderingClient,
  GitHubResearchConnector,
  HackerNewsResearchConnector,
  OpenAIWebSearchResearchConnector,
  RedditResearchConnector,
  WebsiteResearchConnector,
  YCombinatorResearchConnector,
} from "../src/research-connectors.js";

describe("website research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("crawls same-domain pages and extracts readable research documents", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/docs") {
        return new Response(
          `
            <html>
              <head><title>Docs Home</title></head>
              <body>
                <h1>Persistent memory docs</h1>
                <p>Memory infrastructure for AI teams.</p>
                <a href="/pricing">Pricing</a>
              </body>
            </html>
          `,
          { status: 200 },
        );
      }

      if (url === "https://example.com/pricing") {
        return new Response(
          `
            <html>
              <head><title>Pricing</title></head>
              <body>
                <p>Zero rearchitecting. Works with any LLM.</p>
              </body>
            </html>
          `,
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new WebsiteResearchConnector({
      userAgent: "RetainDB-GTM-Operator/Test",
    });

    const documents = await connector.sync({
      urls: ["https://example.com/docs"],
      maxPages: 3,
      maxDepth: 1,
      source: "docs",
    });

    expect(documents).toHaveLength(2);
    expect(documents[0]?.title).toBe("Docs Home");
    expect(documents[0]?.content).toContain("Persistent memory docs");
    expect(documents[1]?.title).toBe("Pricing");
    expect(documents[1]?.excerpt).toContain("Zero rearchitecting");
  });

  it("falls back to Cloudflare Browser Rendering when the raw page is too sparse", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/app") {
        return new Response(
          `
            <html>
              <head><title>App Shell</title></head>
              <body><div id="app"></div><script>window.__APP__ = true;</script></body>
            </html>
          `,
          { status: 200 },
        );
      }

      if (url === "https://api.cloudflare.com/client/v4/accounts/account_123/browser-rendering/markdown") {
        return new Response(
          JSON.stringify({
            result: {
              markdown: "# Dynamic app\n\nPersistent memory and grounded docs without a rewrite.",
            },
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new WebsiteResearchConnector({
      userAgent: "RetainDB-GTM-Operator/Test",
      browserRenderer: new CloudflareBrowserRenderingClient({
        accountId: "account_123",
        apiToken: "cf_test_token",
        userAgent: "RetainDB-GTM-Operator/Test",
      }),
    });

    const documents = await connector.sync({
      urls: ["https://example.com/app"],
      maxPages: 1,
      maxDepth: 0,
      source: "website",
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.content).toContain("Persistent memory");
  });
});

describe("openai web search research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("turns OpenAI web-search citations into research documents", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://api.openai.com/v1/responses") {
        return new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "A recent discussion shows founders struggling with agent memory and context loss in production.",
                    annotations: [
                      {
                        type: "url_citation",
                        title: "Ask HN: Agent memory in production",
                        url: "https://news.ycombinator.com/item?id=123",
                        start_index: 9,
                        end_index: 71,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new OpenAIWebSearchResearchConnector({
      apiKey: "test-openai-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
    });

    const documents = await connector.sync({
      query: "recent discussion about AI agent memory",
      maxResults: 5,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.title).toBe("Ask HN: Agent memory in production");
    expect(documents[0]?.url).toBe("https://news.ycombinator.com/item?id=123");
    expect(documents[0]?.metadata.connectorSource).toBe("openai_web_search");
  });
});

describe("hacker news research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("filters stories down to the query and maps them into research documents", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/askstories.json")) {
        return new Response(JSON.stringify([101, 102]), { status: 200 });
      }

      if (url.endsWith("/item/101.json")) {
        return new Response(
          JSON.stringify({
            id: 101,
            type: "story",
            title: "Ask HN: How do you handle agent memory?",
            text: "<p>We keep losing context across sessions.</p>",
            by: "founder1",
            time: 1_710_000_000,
            score: 12,
            descendants: 4,
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/item/102.json")) {
        return new Response(
          JSON.stringify({
            id: 102,
            type: "story",
            title: "Ask HN: Favorite keyboard layouts",
            text: "<p>Nothing to do with AI.</p>",
            by: "founder2",
            time: 1_710_000_100,
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new HackerNewsResearchConnector();
    const documents = await connector.sync({
      query: "agent memory context",
      storyType: "ask",
      maxResults: 5,
      scanLimit: 5,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.source).toBe("hacker_news");
    expect(documents[0]?.title).toContain("agent memory");
    expect(documents[0]?.content).toContain("losing context");
  });
});

describe("reddit research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to public reddit search without OAuth credentials", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://www.reddit.com/r/LocalLLaMA/search.json")) {
        return new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    title: "How are you handling long-term memory for agents?",
                    selftext: "We keep losing user preferences across sessions.",
                    subreddit: "LocalLLaMA",
                    permalink: "/r/LocalLLaMA/comments/abc123/how_are_you_handling_long_term_memory/",
                    author: "founder_memory",
                    created_utc: 1_710_000_000,
                    score: 42,
                    num_comments: 9,
                  },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new RedditResearchConnector({
      userAgent: "RetainDB-GTM-Operator/Test",
    });

    const documents = await connector.sync({
      query: "agent memory preferences",
      subreddit: "LocalLLaMA",
      maxResults: 5,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.source).toBe("reddit");
    expect(documents[0]?.url).toContain("/r/LocalLLaMA/comments/abc123/");
    expect(documents[0]?.metadata.mode).toBe("public-json");
    expect(documents[0]?.content).toContain("losing user preferences");
  });
});

describe("github research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses GitHub App auth when a PAT is not provided", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.github.com/repos/retaindb/retaindb/installation") {
        return new Response(JSON.stringify({ id: 998877 }), { status: 200 });
      }

      if (url === "https://api.github.com/app/installations/998877/access_tokens") {
        return new Response(
          JSON.stringify({
            token: "ghs_test_installation_token",
            expires_at: "2030-01-01T00:00:00Z",
          }),
          { status: 201 },
        );
      }

      if (url.startsWith("https://api.github.com/search/issues?")) {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer ghs_test_installation_token",
        });
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "Agent memory disappears between sessions",
                body: "We keep losing context when users come back.",
                html_url: "https://github.com/retaindb/retaindb/issues/123",
                updated_at: "2026-03-22T10:00:00Z",
                state: "open",
                repository_url: "https://api.github.com/repos/retaindb/retaindb",
                user: { login: "builder1" },
                labels: [{ name: "bug" }, { name: "memory" }],
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new GitHubResearchConnector({
      appId: "1804939",
      privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
      userAgent: "RetainDB-GTM-Operator/Test",
    });

    const documents = await connector.sync({
      repo: "retaindb/retaindb",
      maxResults: 5,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.source).toBe("github");
    expect(documents[0]?.title).toContain("Agent memory disappears");
    expect(documents[0]?.author).toBe("builder1");
  });
});

describe("y combinator research connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the public YC directory search config to pull company matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://www.ycombinator.com/companies")) {
        return new Response(
          `
            <html>
              <body>
                <script>window.AlgoliaOpts = {"app":"45BWZJ1SGC","key":"public-test-key"};</script>
              </body>
            </html>
          `,
          { status: 200 },
        );
      }

      if (url === "https://45BWZJ1SGC-dsn.algolia.net/1/indexes/*/queries") {
        return new Response(
          JSON.stringify({
            results: [
              {
                hits: [
                  {
                    name: "MemoryCo",
                    slug: "memoryco",
                    website: "https://memoryco.ai",
                    one_liner: "Persistent memory for AI apps",
                    long_description: "AI products that need memory and grounded docs.",
                    batch: "Winter 2026",
                    all_locations: "San Francisco, CA, USA",
                    launched_at: 1_710_000_000,
                    industry: "B2B",
                    subindustry: "Infrastructure",
                    stage: "Early",
                    tags: ["AI", "Developer Tools"],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("missing", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connector = new YCombinatorResearchConnector({
      userAgent: "RetainDB-GTM-Operator/Test",
    });

    const documents = await connector.sync({
      query: "memory ai",
      maxResults: 3,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.source).toBe("y_combinator");
    expect(documents[0]?.metadata.accountDomain).toBe("memoryco.ai");
    expect(documents[0]?.content).toContain("Persistent memory");
  });
});
