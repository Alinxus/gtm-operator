/**
 * Email Finder
 * Cascading strategies: GitHub commit emails → pattern+MX verify → Hunter.io free tier
 */

export interface EmailFindResult {
  email: string;
  method: "github_commits" | "pattern_mx" | "hunter";
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// GitHub commit email extraction
// ---------------------------------------------------------------------------

export class GitHubEmailExtractor {
  constructor(private readonly token?: string) {}

  async findFromUsername(username: string): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "distribution-agent/1.0",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    try {
      // Try public events first — fast and cheap
      const eventsRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`, { headers });
      if (eventsRes.ok) {
        const events = (await eventsRes.json()) as Array<{ type: string; payload?: { commits?: Array<{ author?: { email?: string } }> } }>;
        for (const event of events) {
          if (event.type === "PushEvent" && event.payload?.commits) {
            for (const commit of event.payload.commits) {
              const email = commit.author?.email;
              if (email && isRealEmail(email)) return email;
            }
          }
        }
      }

      // Fall back to recent commits on their repos
      const reposRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=5`, { headers });
      if (reposRes.ok) {
        const repos = (await reposRes.json()) as Array<{ full_name: string; fork: boolean }>;
        for (const repo of repos.filter((r) => !r.fork).slice(0, 3)) {
          const commitsRes = await fetch(
            `https://api.github.com/repos/${repo.full_name}/commits?author=${encodeURIComponent(username)}&per_page=5`,
            { headers },
          );
          if (!commitsRes.ok) continue;
          const commits = (await commitsRes.json()) as Array<{ commit?: { author?: { email?: string } } }>;
          for (const c of commits) {
            const email = c.commit?.author?.email;
            if (email && isRealEmail(email)) return email;
          }
        }
      }
    } catch {
      // network error — return null
    }
    return null;
  }

  async findFromOrgDomain(org: string, domain: string): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "distribution-agent/1.0",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    try {
      const membersRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/members?per_page=10`, { headers });
      if (!membersRes.ok) return null;
      const members = (await membersRes.json()) as Array<{ login: string }>;

      for (const member of members.slice(0, 5)) {
        const email = await this.findFromUsername(member.login);
        if (email && email.endsWith(`@${domain}`)) return email;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pattern generation + MX verification
// ---------------------------------------------------------------------------

export class PatternMxVerifier {
  generatePatterns(firstName: string, lastName: string, domain: string): string[] {
    const f = firstName.toLowerCase().replace(/[^a-z]/g, "");
    const l = lastName.toLowerCase().replace(/[^a-z]/g, "");
    if (!f || !l || !domain) return [];
    return [
      `${f}@${domain}`,
      `${f}.${l}@${domain}`,
      `${f}${l}@${domain}`,
      `${f[0]}${l}@${domain}`,
      `${f[0]}.${l}@${domain}`,
      `${l}@${domain}`,
    ];
  }

  async domainHasMx(domain: string): Promise<boolean> {
    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
      if (!res.ok) return false;
      const data = (await res.json()) as { Answer?: unknown[] };
      return Array.isArray(data.Answer) && data.Answer.length > 0;
    } catch {
      return false;
    }
  }

  // Returns the first pattern that "looks valid" (MX record exists for domain).
  // Full SMTP RCPT-TO verification is Node-only and not available in Workers runtime.
  async findBestPattern(firstName: string, lastName: string, domain: string): Promise<string | null> {
    const hasMx = await this.domainHasMx(domain);
    if (!hasMx) return null;
    const patterns = this.generatePatterns(firstName, lastName, domain);
    // Without SMTP verification we return the most common pattern (first.last@)
    return patterns[1] ?? patterns[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Hunter.io free-tier lookup (25 searches/month)
// ---------------------------------------------------------------------------

export class HunterEmailFinder {
  constructor(private readonly apiKey: string) {}

  async find(input: { domain: string; firstName?: string; lastName?: string }): Promise<string | null> {
    const params = new URLSearchParams({ domain: input.domain, api_key: this.apiKey });
    if (input.firstName) params.set("first_name", input.firstName);
    if (input.lastName) params.set("last_name", input.lastName);

    try {
      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: { email?: string; score?: number } };
      const email = data.data?.email;
      const score = data.data?.score ?? 0;
      if (email && score >= 50) return email;
    } catch {
      // ignore
    }
    return null;
  }

  async domainSearch(domain: string): Promise<string[]> {
    const params = new URLSearchParams({ domain, api_key: this.apiKey, limit: "5" });
    try {
      const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { emails?: Array<{ value?: string; confidence?: number }> } };
      return (data.data?.emails ?? [])
        .filter((e) => (e.confidence ?? 0) >= 50 && e.value)
        .map((e) => e.value as string);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Unified EmailFinder — cascades all strategies
// ---------------------------------------------------------------------------

export interface EmailFinderOptions {
  githubToken?: string;
  hunterApiKey?: string;
}

export class EmailFinder {
  private github: GitHubEmailExtractor;
  private pattern: PatternMxVerifier;
  private hunter?: HunterEmailFinder;

  constructor(options: EmailFinderOptions = {}) {
    this.github = new GitHubEmailExtractor(options.githubToken);
    this.pattern = new PatternMxVerifier();
    if (options.hunterApiKey) this.hunter = new HunterEmailFinder(options.hunterApiKey);
  }

  async findEmail(input: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    domain?: string | null;
    githubUsername?: string | null;
    githubOrg?: string | null;
  }): Promise<EmailFindResult | null> {
    // Resolve first/last from fullName if needed
    const { firstName, lastName } = resolveNames(input.firstName, input.lastName, input.fullName);

    // Strategy 1: GitHub commit emails (best quality, free)
    if (input.githubUsername) {
      const email = await this.github.findFromUsername(input.githubUsername);
      if (email) return { email, method: "github_commits", confidence: "high" };
    }
    if (input.githubOrg && input.domain) {
      const email = await this.github.findFromOrgDomain(input.githubOrg, input.domain);
      if (email) return { email, method: "github_commits", confidence: "high" };
    }

    // Strategy 2: Pattern + MX verify
    if (firstName && lastName && input.domain) {
      const email = await this.pattern.findBestPattern(firstName, lastName, input.domain);
      if (email) return { email, method: "pattern_mx", confidence: "medium" };
    }

    // Strategy 3: Hunter.io
    if (this.hunter && input.domain) {
      const email = await this.hunter.find({ domain: input.domain, firstName: firstName ?? undefined, lastName: lastName ?? undefined });
      if (email) return { email, method: "hunter", confidence: "high" };

      // If no specific person match, try domain search for any valid contact
      if (!firstName && !lastName) {
        const emails = await this.hunter.domainSearch(input.domain);
        if (emails[0]) return { email: emails[0], method: "hunter", confidence: "medium" };
      }
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRealEmail(email: string): boolean {
  if (!email.includes("@")) return false;
  const noreplyPatterns = ["noreply", "no-reply", "users.noreply", "github.com", "action@", "bot@"];
  const lower = email.toLowerCase();
  return !noreplyPatterns.some((p) => lower.includes(p));
}

function resolveNames(
  firstName?: string | null,
  lastName?: string | null,
  fullName?: string | null,
): { firstName: string | null; lastName: string | null } {
  if (firstName && lastName) return { firstName, lastName };
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return { firstName: parts[0] ?? null, lastName: parts[parts.length - 1] ?? null };
    }
    return { firstName: parts[0] ?? null, lastName: null };
  }
  return { firstName: firstName ?? null, lastName: lastName ?? null };
}
