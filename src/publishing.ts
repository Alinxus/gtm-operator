import { createHmac, createSign } from "node:crypto";
import type { Asset, Brand, PublishDestination, PublishDestinationKind, Touch, Workspace } from "./domain.js";

interface PublishContext {
  destination: PublishDestination;
  brand: Brand;
  workspace: Workspace;
  asset: Asset;
  touch?: Touch | null;
}

export interface PublishExecutionResult {
  remoteUrl?: string | null;
  externalId?: string | null;
  metadata: Record<string, unknown>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stringifyRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function buildFrontmatter(ctx: PublishContext) {
  const lines = [
    "---",
    `title: "${ctx.asset.title.replace(/"/g, '\\"')}"`,
    `channel: "${ctx.asset.channel}"`,
    `lane: "${ctx.asset.lane ?? ctx.asset.channel}"`,
    `generated_by: "RetainDB Growth Operator"`,
  ];
  if (ctx.asset.claimIds.length > 0) {
    lines.push("claim_ids:");
    for (const claimId of ctx.asset.claimIds) {
      lines.push(`  - "${claimId}"`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function buildGitHubContentPath(ctx: PublishContext) {
  const config = stringifyRecord(ctx.destination.config);
  const contentRoot = typeof config.contentRoot === "string" && config.contentRoot.trim().length > 0 ? config.contentRoot.trim() : "content";
  const defaultTemplate = "{{content_root}}/{{slug}}.mdx";
  const template = typeof config.pathTemplate === "string" && config.pathTemplate.trim().length > 0 ? config.pathTemplate.trim() : defaultTemplate;
  const metadata = stringifyRecord(ctx.asset.metadata);
  const slug =
    (typeof metadata.slug === "string" && metadata.slug.trim().length > 0 ? metadata.slug : undefined) ??
    slugify(ctx.asset.title);
  const burstId = typeof metadata.campaignBurstId === "string" ? metadata.campaignBurstId : "";
  const values = {
    slug,
    title_slug: slugify(ctx.asset.title),
    asset_id: ctx.asset.id,
    channel: ctx.asset.channel,
    lane: ctx.asset.lane ?? ctx.asset.channel,
    content_root: normalizePath(contentRoot),
    date: todaySlug(),
    campaign_burst_id: burstId,
  };
  return normalizePath(interpolate(template, values));
}

export function buildGitHubFileContent(ctx: PublishContext) {
  const metadata = stringifyRecord(ctx.asset.metadata);
  const existingBody = typeof metadata.publishBody === "string" && metadata.publishBody.trim().length > 0 ? metadata.publishBody : ctx.asset.body;
  return `${buildFrontmatter(ctx)}${existingBody.trim()}\n`;
}

export function buildWebhookExportPayload(ctx: PublishContext) {
  const config = stringifyRecord(ctx.destination.config);
  const payloadVersion = typeof config.payloadVersion === "string" && config.payloadVersion.trim().length > 0 ? config.payloadVersion : "v1";
  return {
    version: payloadVersion,
    destination: {
      id: ctx.destination.id,
      kind: ctx.destination.kind,
      name: ctx.destination.name,
    },
    workspace: {
      id: ctx.workspace.id,
      slug: ctx.workspace.slug,
      name: ctx.workspace.name,
    },
    brand: {
      id: ctx.brand.id,
      slug: ctx.brand.slug,
      name: ctx.brand.name,
    },
    asset: {
      id: ctx.asset.id,
      channel: ctx.asset.channel,
      lane: ctx.asset.lane ?? null,
      sourceLane: ctx.asset.sourceLane ?? null,
      campaignBurstId: ctx.asset.campaignBurstId ?? null,
      title: ctx.asset.title,
      body: ctx.asset.body,
      claimIds: ctx.asset.claimIds,
      approvalStage: ctx.asset.approvalStage,
      metadata: ctx.asset.metadata,
    },
    touch: ctx.touch
      ? {
          id: ctx.touch.id,
          touchType: ctx.touch.touchType,
          status: ctx.touch.status,
          CTA: ctx.touch.CTA,
          metadata: ctx.touch.metadata,
        }
      : null,
    exportedAt: new Date().toISOString(),
  };
}

export class GitHubPublishingClient {
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly options: {
      token?: string;
      appId?: string;
      privateKey?: string;
      installationId?: string;
      userAgent?: string;
    },
  ) {}

  private githubHeaders(token?: string) {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": this.options.userAgent ?? "RetainDB-Growth-Operator/0.3",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private createAppJwt() {
    if (!this.options.appId || !this.options.privateKey) {
      throw new Error("GitHub publishing requires GITHUB_TOKEN or GitHub App credentials.");
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

  private async resolveInstallationId(appJwt: string, owner: string, repo: string) {
    if (this.options.installationId) return this.options.installationId;

    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
      headers: this.githubHeaders(appJwt),
    });
    if (repoResponse.ok) {
      const payload = (await repoResponse.json()) as { id?: number | string };
      if (payload.id) return String(payload.id);
    }

    const installationsResponse = await fetch("https://api.github.com/app/installations?per_page=100", {
      headers: this.githubHeaders(appJwt),
    });
    if (!installationsResponse.ok) return undefined;
    const payload = (await installationsResponse.json()) as Array<{ id?: number | string }>;
    const installationId = payload.find((item) => item.id)?.id;
    return installationId ? String(installationId) : undefined;
  }

  private async resolveToken(owner: string, repo: string) {
    if (this.options.token) return this.options.token;
    if (!this.options.appId || !this.options.privateKey) {
      throw new Error("GitHub publishing requires GITHUB_TOKEN or GitHub App credentials.");
    }

    const appJwt = this.createAppJwt();
    const installationId = await this.resolveInstallationId(appJwt, owner, repo);
    if (!installationId) throw new Error(`No GitHub App installation found for ${owner}/${repo}.`);

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
      throw new Error(`GitHub installation token request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { token?: string; expires_at?: string };
    if (!payload.token) throw new Error("GitHub installation token response did not include a token.");
    const expiresAt = payload.expires_at ? new Date(payload.expires_at).getTime() : now + 50 * 60_000;
    this.tokenCache.set(installationId, { token: payload.token, expiresAt });
    return payload.token;
  }

  async publish(ctx: PublishContext): Promise<PublishExecutionResult> {
    const config = stringifyRecord(ctx.destination.config);
    const owner = typeof config.owner === "string" ? config.owner.trim() : "";
    const repo = typeof config.repo === "string" ? config.repo.trim() : "";
    const baseBranch = typeof config.baseBranch === "string" && config.baseBranch.trim().length > 0 ? config.baseBranch.trim() : "main";
    if (!owner || !repo) throw new Error("GitHub publish destination requires owner and repo.");

    const token = await this.resolveToken(owner, repo);
    const branchName = `growth/${ctx.asset.channel}/${todaySlug()}-${ctx.asset.id.slice(-8)}`;
    const baseRefResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, {
      headers: this.githubHeaders(token),
    });
    if (!baseRefResponse.ok) {
      throw new Error(`GitHub base branch lookup failed: ${baseRefResponse.status} ${baseRefResponse.statusText}`);
    }

    const baseRef = (await baseRefResponse.json()) as { object?: { sha?: string } };
    const baseSha = baseRef.object?.sha;
    if (!baseSha) throw new Error(`GitHub base branch ${baseBranch} did not return a SHA.`);

    const createBranchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: {
        ...this.githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    if (!(createBranchResponse.ok || createBranchResponse.status === 422)) {
      throw new Error(`GitHub branch creation failed: ${createBranchResponse.status} ${createBranchResponse.statusText}`);
    }

    const path = buildGitHubContentPath(ctx);
    const existingResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branchName)}`,
      { headers: this.githubHeaders(token) },
    );
    const existingPayload = existingResponse.ok ? ((await existingResponse.json()) as { sha?: string }) : null;
    const metadata = stringifyRecord(ctx.asset.metadata);
    const commitMessageTemplate =
      typeof config.commitMessageTemplate === "string" && config.commitMessageTemplate.trim().length > 0
        ? config.commitMessageTemplate
        : "Add growth asset for {{title_slug}}";
    const prTitleTemplate =
      typeof config.prTitleTemplate === "string" && config.prTitleTemplate.trim().length > 0
        ? config.prTitleTemplate
        : "Growth Operator: {{title}}";
    const variables = {
      title: ctx.asset.title,
      title_slug: slugify(ctx.asset.title),
      slug: typeof metadata.slug === "string" && metadata.slug.trim().length > 0 ? metadata.slug : slugify(ctx.asset.title),
      channel: ctx.asset.channel,
      lane: ctx.asset.lane ?? ctx.asset.channel,
    };

    const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        ...this.githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: interpolate(commitMessageTemplate, variables),
        content: Buffer.from(buildGitHubFileContent(ctx), "utf8").toString("base64"),
        branch: branchName,
        ...(existingPayload?.sha ? { sha: existingPayload.sha } : {}),
      }),
    });

    if (!contentResponse.ok) {
      const message = await contentResponse.text().catch(() => "");
      throw new Error(`GitHub content publish failed: ${contentResponse.status} ${contentResponse.statusText}${message ? ` - ${message}` : ""}`);
    }

    const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        ...this.githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: interpolate(prTitleTemplate, variables),
        head: branchName,
        base: baseBranch,
        body: `Generated by RetainDB Growth Operator for asset ${ctx.asset.id}.`,
      }),
    });

    if (!(prResponse.ok || prResponse.status === 422)) {
      const message = await prResponse.text().catch(() => "");
      throw new Error(`GitHub PR creation failed: ${prResponse.status} ${prResponse.statusText}${message ? ` - ${message}` : ""}`);
    }

    const prPayload = (await prResponse.json().catch(() => ({} as Record<string, unknown>))) as {
      html_url?: string;
      number?: number | string;
      url?: string;
    };

    return {
      remoteUrl: prPayload.html_url ?? prPayload.url ?? null,
      externalId: prPayload.number ? String(prPayload.number) : null,
      metadata: {
        owner,
        repo,
        branchName,
        baseBranch,
        path,
      },
    };
  }
}

export class WebhookPublishingClient {
  constructor(
    private readonly options: {
      userAgent?: string;
    } = {},
  ) {}

  async publish(ctx: PublishContext): Promise<PublishExecutionResult> {
    const config = stringifyRecord(ctx.destination.config);
    const targetUrl = typeof config.targetUrl === "string" ? config.targetUrl.trim() : "";
    if (!targetUrl) throw new Error("Webhook publish destination requires targetUrl.");

    const payload = buildWebhookExportPayload(ctx);
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": this.options.userAgent ?? "RetainDB-Growth-Operator/0.3",
    };

    const configuredHeaders = stringifyRecord(config.headers);
    for (const [key, value] of Object.entries(configuredHeaders)) {
      if (typeof value === "string" && value.trim().length > 0) {
        headers[key] = value;
      }
    }

    if (typeof config.bearerToken === "string" && config.bearerToken.trim().length > 0) {
      headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
    }
    if (typeof config.secret === "string" && config.secret.trim().length > 0) {
      headers["X-RetainDB-Signature"] = `sha256=${createHmac("sha256", config.secret.trim()).update(body).digest("hex")}`;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Webhook export failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`);
    }

    return {
      remoteUrl: targetUrl,
      externalId: response.headers.get("x-request-id") ?? response.headers.get("cf-ray") ?? null,
      metadata: {
        targetUrl,
        status: response.status,
      },
    };
  }
}

export function destinationKindForChannel(channel: Asset["channel"]): PublishDestinationKind {
  return channel === "seo" || channel === "landing" ? "github_pr" : "webhook_export";
}
