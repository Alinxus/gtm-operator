/**
 * Social publishing clients
 * X (Twitter) pay-per-use API — post, thread, DM
 * Reddit OAuth API — submit post, post comment
 */

// ---------------------------------------------------------------------------
// X / Twitter
// ---------------------------------------------------------------------------

export interface XPostResult {
  id: string;
  url: string;
}

export interface XDmResult {
  id: string;
}

export class XPublishingClient {
  constructor(
    private readonly options: {
      accessToken: string;
      oauthClientId?: string;
      oauthClientSecret?: string;
      refreshToken?: string;
    },
  ) {}

  private get authHeader() {
    return { Authorization: `Bearer ${this.options.accessToken}` };
  }

  async postTweet(input: { text: string; replyToTweetId?: string }): Promise<XPostResult> {
    const body: Record<string, unknown> = { text: input.text };
    if (input.replyToTweetId) body.reply = { in_reply_to_tweet_id: input.replyToTweetId };

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { ...this.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X post failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { data: { id: string; text: string } };
    const id = data.data.id;
    return { id, url: `https://x.com/i/web/status/${id}` };
  }

  async postThread(tweets: string[]): Promise<{ ids: string[]; firstUrl: string }> {
    if (tweets.length === 0) throw new Error("Thread must have at least one tweet");
    const ids: string[] = [];
    let replyToId: string | undefined;

    for (const text of tweets) {
      const result = await this.postTweet({ text, replyToTweetId: replyToId });
      ids.push(result.id);
      replyToId = result.id;
      // Small delay to avoid rate limiting
      if (ids.length < tweets.length) await sleep(600);
    }

    return { ids, firstUrl: `https://x.com/i/web/status/${ids[0]}` };
  }

  async sendDm(input: { recipientId: string; text: string }): Promise<XDmResult> {
    const res = await fetch(`https://api.twitter.com/2/dm_conversations/with/${encodeURIComponent(input.recipientId)}/messages`, {
      method: "POST",
      headers: { ...this.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X DM failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { data: { dm_conversation_id: string; dm_event_id: string } };
    return { id: data.data.dm_event_id };
  }

  async resolveUserId(username: string): Promise<string | null> {
    const clean = username.replace(/^@/, "");
    const res = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(clean)}`, {
      headers: this.authHeader,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id: string } };
    return data.data?.id ?? null;
  }

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
    if (!this.options.oauthClientId || !this.options.oauthClientSecret || !this.options.refreshToken) {
      throw new Error("X OAuth credentials required for token refresh");
    }
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.options.refreshToken,
      client_id: this.options.oauthClientId,
    });
    const credentials = btoa(`${this.options.oauthClientId}:${this.options.oauthClientSecret}`);
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X token refresh failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

export interface RedditPostResult {
  id: string;
  fullname: string;
  url: string;
}

export interface RedditCommentResult {
  id: string;
  fullname: string;
  url: string;
}

export class RedditPublishingClient {
  constructor(
    private readonly options: {
      bearerToken: string;
      userAgent: string;
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
    },
  ) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.options.bearerToken}`,
      "User-Agent": this.options.userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  async submitPost(input: {
    subreddit: string;
    title: string;
    text?: string;
    url?: string;
    kind?: "self" | "link";
    flairId?: string;
  }): Promise<RedditPostResult> {
    const kind = input.kind ?? (input.url ? "link" : "self");
    const params = new URLSearchParams({
      sr: input.subreddit,
      kind,
      title: input.title,
      api_type: "json",
      resubmit: "true",
    });
    if (kind === "self" && input.text) params.set("text", input.text);
    if (kind === "link" && input.url) params.set("url", input.url);
    if (input.flairId) params.set("flair_id", input.flairId);

    const res = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: this.headers,
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Reddit submit failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      json?: { data?: { url?: string; id?: string; name?: string }; errors?: unknown[] };
    };

    const errors = data.json?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error(`Reddit submit error: ${JSON.stringify(errors)}`);
    }

    const postData = data.json?.data;
    const id = postData?.id ?? "";
    const fullname = postData?.name ?? `t3_${id}`;
    const url = postData?.url ?? `https://reddit.com/r/${input.subreddit}/comments/${id}`;
    return { id, fullname, url };
  }

  async postComment(input: { parentFullname: string; text: string }): Promise<RedditCommentResult> {
    const params = new URLSearchParams({
      parent: input.parentFullname,
      text: input.text,
      api_type: "json",
    });

    const res = await fetch("https://oauth.reddit.com/api/comment", {
      method: "POST",
      headers: this.headers,
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Reddit comment failed ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      json?: { data?: { things?: Array<{ data?: { id?: string; name?: string; permalink?: string } }> }; errors?: unknown[] };
    };

    const errors = data.json?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error(`Reddit comment error: ${JSON.stringify(errors)}`);
    }

    const thing = data.json?.data?.things?.[0]?.data;
    const id = thing?.id ?? "";
    const fullname = thing?.name ?? `t1_${id}`;
    const url = thing?.permalink ? `https://reddit.com${thing.permalink}` : `https://reddit.com`;
    return { id, fullname, url };
  }

  async refreshBearerToken(): Promise<{ bearerToken: string; expiresAt: number }> {
    if (!this.options.clientId || !this.options.clientSecret || !this.options.refreshToken) {
      throw new Error("Reddit client credentials required for token refresh");
    }
    const credentials = btoa(`${this.options.clientId}:${this.options.clientSecret}`);
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.options.refreshToken,
    });
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "User-Agent": this.options.userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Reddit token refresh failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return {
      bearerToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}

// ---------------------------------------------------------------------------
// Thread formatter — splits long text into ≤280-char tweets
// ---------------------------------------------------------------------------

export function formatXThread(text: string, maxChars = 270): string[] {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const tweets: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      tweets.push(para);
    } else {
      // Split long paragraph at sentence boundaries
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
      let current = "";
      for (const sentence of sentences) {
        const s = sentence.trim();
        if ((current + " " + s).trim().length <= maxChars) {
          current = (current + " " + s).trim();
        } else {
          if (current) tweets.push(current);
          current = s.slice(0, maxChars);
        }
      }
      if (current) tweets.push(current);
    }
  }

  return tweets.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
