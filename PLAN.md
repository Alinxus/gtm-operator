I now have a complete picture of the codebase. Here is the full implementation plan.

---

# Implementation Plan: AI Distribution and Marketing Agent System

## Codebase Architecture Summary (What You Already Have)

Before diving into phases, here is the exact wiring that matters for every new module:

- **`src/domain.ts`** — all entity types. `Touch.touchType` is already typed as `"email" | "dm" | "public_reply" | "post" | ...`. `ProspectPerson.email` field already exists but is never populated.
- **`src/config.ts`** / `AppConfig` — the single place to add env vars. Pattern: add to `EnvSchema`, expose on `AppConfig`, forward through `workerEnvToConfig` in `worker.ts`.
- **`src/research-connectors.ts`** — all read connectors live here as classes. `ResearchCoordinator` at the bottom assembles them and exposes `syncX`, `syncReddit`, `syncGitHub`, etc. Write connectors belong in a new file.
- **`src/operator-api.ts`** / `createOperatorApp` — all HTTP routes. New routes go here or in a sub-app mounted into it.
- **`src/growth-operator.ts`** / `GrowthOperator extends GtmOperator` — the main orchestration class. New agent loops go here or in focused operator subclasses.
- **`src/operator-workers.ts`** — LLM workers (`runOperatorResearchWorker`, `runOperatorSequenceWorker`). New LLM workers follow this exact pattern: accept typed input, call `llm.generateObject(schema)`, return typed output.
- **`src/publishing.ts`** — publish clients (GitHub PR, webhook). Email/X/Reddit send clients belong in a new `src/sending.ts`.
- **`src/worker.ts`** — Cloudflare Worker entrypoint. Cron handlers get a `scheduled` export added here.
- **`wrangler.jsonc`** — Cron triggers and Hyperdrive binding go here.
- **`sql/schema.sql`** — append new `create table if not exists` statements; the store's `ensureSchema()` runs this on boot.
- **`src/store/postgres-store.ts`** — implement new store methods; `in-memory-store.ts` needs stubs for the same interface.
- **`src/domain.ts` `MarketingStore` interface** — add new method signatures here so TypeScript enforces both store implementations.

---

## Phase 1: Complete the Outbound Email Loop

This is the highest-revenue path. It closes the gap from "touch record exists" to "email actually sent and reply tracked."

### Module 1.1 — Email Finder

**What it does.** Given a `ProspectPerson` and their `ProspectAccount`, tries three cascading strategies to find a deliverable email address: (1) GitHub commit search for the person's GitHub username, (2) common pattern generation (firstname@domain, first.last@domain, etc.) with SMTP MX+RCPT verification, (3) Hunter.io free-tier lookup (25/month). Returns the first verified address and writes it back to the person record.

**New file:** `src/email-finder.ts`

Key exports:
```
class GitHubEmailExtractor
  async findFromCommits(input: { githubUsername: string; githubToken?: string }): Promise<string | null>
    // Calls GET /users/{username}/events/public, scans PushEvent.commits[].author.email
    // Filters out noreply@github.com patterns
    // Returns first non-noreply email found

class PatternSmtpVerifier
  async verify(input: { email: string }): Promise<boolean>
    // DNS MX lookup via fetch("https://dns.google/resolve?name=domain&type=MX")
    // SMTP RCPT TO simulation via TCP socket (Node only, not available in Workers — gate behind runtime check)
    // In Workers runtime: skip SMTP, return true for pattern match only (acceptable tradeoff)
  
  generatePatterns(input: { firstName: string; lastName: string; domain: string }): string[]
    // Produces: first@, first.last@, flast@, firstl@, f.last@ (5 variants)

class HunterEmailFinder
  async find(input: { domain: string; firstName?: string; lastName?: string }): Promise<string | null>
    // GET https://api.hunter.io/v2/email-finder?domain=X&first_name=Y&last_name=Z&api_key=KEY
    // Returns data.email if confidence >= 70

export class EmailFinder
  async findEmail(input: {
    person: ProspectPerson
    account: ProspectAccount
    githubToken?: string
    hunterApiKey?: string
  }): Promise<{ email: string; method: "github_commits" | "smtp_pattern" | "hunter" } | null>
    // Cascade: GitHubEmailExtractor → PatternSmtpVerifier → HunterEmailFinder
    // Updates person.metadata.emailFindMethod on success
```

**External APIs/libs:** GitHub REST API (already have token), Google DNS-over-HTTPS (free, no key), Hunter.io (free 25/mo).

**New config keys to add in `src/config.ts`:**
- `HUNTER_API_KEY` (optional string)
- `SMTP_VERIFY_ENABLED` (boolean, default false — skip in Workers, enable in Node)

**Connects to existing code:** Called from `GtmOperator.ingestSignal` and the new cron tick after a person record is created without an email.

**Complexity:** M

---

### Module 1.2 — Email Sending (Resend)

**What it does.** Sends transactional/outbound emails via Resend API. Takes an approved `Touch` with `touchType: "email"`, resolves the recipient from the linked `ProspectPerson`, and dispatches. Records sent status and Resend message ID back to the touch record. Handles soft bounce and unsubscribe webhook inbound.

**New file:** `src/sending.ts`

Key exports:
```
export class ResendEmailClient
  constructor(options: { apiKey: string; fromAddress: string; fromName: string })
  
  async send(input: {
    to: string
    subject: string
    text: string
    html?: string
    replyTo?: string
    tags?: Record<string, string>  // used for touch_id, sequence_id attribution
  }): Promise<{ id: string }>
    // POST https://api.resend.com/emails
    // Body: { from, to, subject, text, html, reply_to, tags }
    // Throws if !response.ok
  
  async sendBatch(emails: SendInput[]): Promise<{ id: string }[]>
    // POST https://api.resend.com/emails/batch (up to 100 per call)
```

**New file additions to `src/operator-api.ts`:**
```
// Webhook endpoint for Resend delivery events
app.post("/v2/webhooks/resend", async (c) => { ... })
  // Validates Resend-Signature header using HMAC-SHA256
  // On "email.bounced": marks touch.status = "skipped", writes metadata.bounceReason
  // On "email.complained": marks person.metadata.unsubscribed = true
  // On "email.clicked" / "email.opened": creates Attribution record
```

**New config keys:**
- `RESEND_API_KEY`
- `RESEND_FROM_ADDRESS` (e.g. `"hi@yourco.com"`)
- `RESEND_FROM_NAME`
- `RESEND_WEBHOOK_SECRET` (for signature verification)

**Domain changes (`src/domain.ts`):** Add `touchType: "email_follow_up"` is not needed — existing `"follow_up"` suffices. However, add `sentAt?: string | null` and `externalMessageId?: string | null` to the `Touch` interface, and a matching migration appended to `sql/schema.sql`.

**Connects to existing code:** `GrowthOperator` already has a method that creates approved touches. After approval of a touch with `touchType: "email"`, the new `sendApprovedTouch(touchId)` method on `GrowthOperator` calls `EmailFinder.findEmail` if `person.email` is null, then `ResendEmailClient.send`.

**Complexity:** M

---

### Module 1.3 — Email Sequence Executor

**What it does.** Executes multi-step email sequences on schedule (day 1, day 4, day 10). A sequence has multiple touches. After touch 1 is sent, this module writes the `scheduledFor` timestamp for touch 2 into the touch's `metadata`. The cron tick (Phase 3) reads these and dispatches them. Also stops the sequence if a reply is detected.

**Modifications to existing files:**

`src/growth-operator.ts` — add:
```
async sendApprovedTouch(touchId: string): Promise<{ sent: boolean; reason: string }>
  // 1. Load touch, sequence, person, account
  // 2. If person.email is null, call EmailFinder.findEmail → update person
  // 3. If still no email, return { sent: false, reason: "no_email" }
  // 4. Convert touch.body to HTML (simple markdown-to-html: replace \n\n with <p>)
  // 5. Call ResendEmailClient.send
  // 6. Update touch: status="sent", metadata.sentAt, metadata.resendId
  // 7. Update sequence to "in_progress"
  // 8. Schedule next touch: set metadata.scheduledFor = now + sequenceDayOffset
  // 9. Advance opportunity.stage to "touched"

async scheduleSequenceFollowUps(sequenceId: string): Promise<void>
  // Reads all touches for sequence, assigns scheduledFor offsets:
  // touch[0]: send immediately (day 0)
  // touch[1]: now + 3 days
  // touch[2]: now + 9 days
  // etc.

async detectAndRecordReply(input: { resendMessageId: string; replyContent: string }): Promise<void>
  // Finds touch by externalMessageId, sets status="replied"
  // Advances opportunity to "replied", creates Conversation record
```

`src/operator-api.ts` — add routes:
```
POST /v2/workspaces/:workspaceId/touches/:touchId/send
  // Triggers sendApprovedTouch immediately (for manual dispatch)
  // Returns { sent, reason, touchId }

POST /v2/workspaces/:workspaceId/sequences/:sequenceId/activate
  // Schedules all touches with day offsets
  // Returns { scheduled: number }
```

**Complexity:** M

---

### Module 1.4 — LLM ICP Scorer (replacing keyword-based)

**What it does.** Replaces the keyword-scoring in `src/gtm-operator.ts` with a real LLM call. Takes account name, signal content, website summary, tech stack signals, and ICP definition. Returns a structured fit assessment with a numeric score and reasoning.

**New file:** `src/operator-workers.ts` addition (new exported function, not a new file):
```
export async function runIcpScoringWorker(input: {
  llm: LanguageModelProvider
  workspace: Workspace
  account: ProspectAccount
  signal: Signal
  documents: ExternalResearchDocument[]
}): Promise<{ score: number; fitTier: "hot" | "warm" | "cold"; reasons: string[]; disqualifiers: string[] }>
  // schema: z.object({ score: z.number().min(0).max(100), fitTier: z.enum([...]), reasons: z.array(z.string()), disqualifiers: z.array(z.string()) })
  // Prompt: ICP definition, signal content, account summary, website excerpts
  // Returns structured JSON via llm.generateObject
```

**Modification to `src/gtm-operator.ts`:** In `scoreSignal`, replace the keyword-based `clampScore` calculation with a call to `runIcpScoringWorker` when `llm.enabled`. Keep the keyword path as the fallback when LLM is disabled. Store the LLM reasons in `signal.metadata.icpScoringReasons`.

**Complexity:** S

---

## Phase 2: X and Reddit Distribution

### Module 2.1 — X Pay-Per-Use Write Client

**What it does.** Posts tweets, threads (multi-part), and DMs via the new X pay-per-use API (console.x.ai). Uses OAuth 2.0 with PKCE or app-only credentials depending on the action.

**New file:** `src/social-publishers.ts`

```
export class XPublishingClient
  constructor(options: {
    bearerToken?: string       // app-only, for reads and DMs to users who've authorized
    oauthClientId?: string     // OAuth 2.0 client ID
    oauthClientSecret?: string
    accessToken?: string       // user access token (stored per workspace in DB)
    refreshToken?: string
  })

  // Post a single tweet
  async postTweet(input: {
    text: string
    replyToTweetId?: string
  }): Promise<{ id: string; url: string }>
    // POST https://api.twitter.com/2/tweets
    // Authorization: Bearer {accessToken}
    // Cost: ~$0.010/post at new pricing

  // Post a thread (sequential tweets)
  async postThread(tweets: string[]): Promise<{ ids: string[]; firstUrl: string }>
    // Calls postTweet sequentially, each replying to the previous id
    // Delays 500ms between posts to avoid rate limits

  // Send a DM
  async sendDm(input: {
    recipientId: string  // X user ID
    text: string
  }): Promise<{ id: string }>
    // POST https://api.twitter.com/2/dm_conversations/with/{participant_id}/messages
    // Cost: ~$0.015/DM

  // Look up user ID by username (needed before DM)
  async resolveUserId(username: string): Promise<string | null>
    // GET https://api.twitter.com/2/users/by/username/{username}
    // Cost: ~$0.005/read

  // Refresh access token
  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>
    // POST https://api.twitter.com/2/oauth2/token
```

**New config keys:**
- `X_ACCESS_TOKEN` (user OAuth token, per brand or workspace — store in DB for multi-tenant)
- `X_REFRESH_TOKEN`
- `X_OAUTH_CLIENT_ID`
- `X_OAUTH_CLIENT_SECRET`

**Modification to `src/research-connectors.ts`:** Upgrade `XResearchConnector` to use the new pay-per-use endpoint. The existing `GET /2/tweets/search/recent` endpoint works — no change to read logic needed, just ensure the bearer token is the new console-issued one.

**Modification to `src/growth-operator.ts`:** Add:
```
async sendApprovedXTouch(touchId: string): Promise<{ sent: boolean; postUrl?: string }>
  // Loads touch with touchType "dm" or "post"
  // For "post": calls XPublishingClient.postTweet or postThread depending on metadata.isThread
  // For "dm": resolves recipientId from person.socialHandle, calls sendDm
  // Updates touch.status = "sent", metadata.xPostId, metadata.xPostUrl
  // Creates Attribution record
```

**Modification to `src/operator-api.ts`:** Add:
```
POST /v2/workspaces/:workspaceId/touches/:touchId/send-x
  // Sends an approved X touch immediately

POST /v2/workspaces/:workspaceId/social/x/thread
  // Ad-hoc endpoint: accepts { text: string[] } and posts a thread directly
  // Used by chat interface in Phase 3
```

**Complexity:** M

---

### Module 2.2 — Reddit Write Client

**What it does.** Posts new threads and comments to Reddit via OAuth. Uses the existing `REDDIT_BEARER_TOKEN` credential path already wired in config.

**Addition to `src/social-publishers.ts`:**
```
export class RedditPublishingClient
  constructor(options: {
    bearerToken: string
    userAgent: string
  })

  // Submit a new post to a subreddit
  async submitPost(input: {
    subreddit: string
    title: string
    text: string  // selfpost body (markdown)
    kind?: "self" | "link"
    url?: string  // for link posts
  }): Promise<{ id: string; url: string; fullname: string }>
    // POST https://oauth.reddit.com/api/submit
    // Params: sr, kind, title, text/url, api_type=json
    // Returns json.data.url, json.data.id

  // Reply to an existing post or comment
  async postComment(input: {
    parentFullname: string  // e.g. "t3_abc123" for a post, "t1_xyz" for a comment
    text: string            // markdown
  }): Promise<{ id: string; url: string }>
    // POST https://oauth.reddit.com/api/comment
    // Params: parent, text, api_type=json
    // Returns json.data.things[0].data.permalink
```

**Reddit OAuth note:** The existing `REDDIT_BEARER_TOKEN` is a user token obtained via the standard OAuth code flow. For write access, the token must have the `submit` scope. Add a scope check and a helpful error message if the token is read-only.

**Modification to `src/growth-operator.ts`:** Add:
```
async sendApprovedRedditTouch(touchId: string): Promise<{ sent: boolean; postUrl?: string }>
  // Loads touch with touchType "community_post" or "public_reply"
  // For new post: uses metadata.subreddit from touch, calls submitPost
  // For reply: uses metadata.parentFullname, calls postComment
  // Updates touch.status = "sent"
```

**Modification to `src/operator-api.ts`:** Add:
```
POST /v2/workspaces/:workspaceId/touches/:touchId/send-reddit
POST /v2/workspaces/:workspaceId/social/reddit/post  // ad-hoc
```

**New config key:**
- `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (needed for token refresh)
- `REDDIT_REFRESH_TOKEN` (stored per brand; bearer token auto-refreshes)

**Complexity:** S

---

### Module 2.3 — Content Distribution Worker (LLM thread/post generator)

**What it does.** Given a social asset brief (from the existing `SocialAsset` entity), generates a complete X thread (5-8 tweets), a Reddit post (title + body), or a newsletter pitch. This replaces the ad-hoc body generation in `GrowthOperator.runSocialLane`.

**Addition to `src/operator-workers.ts`:**
```
export async function runContentDistributionWorker(input: {
  llm: LanguageModelProvider
  brand: Brand
  workspace: Workspace
  asset: SocialAsset
  claims: Claim[]
  platform: "x_thread" | "reddit_post" | "newsletter_pitch"
}): Promise<{
  title?: string
  tweets?: string[]  // for x_thread, each <= 280 chars
  body?: string      // for reddit/newsletter
  subject?: string   // for newsletter
  hashtags?: string[]
}>
  // Separate schema for each platform type
  // For x_thread: schema has tweets: z.array(z.string().max(280)).min(3).max(8)
  // For reddit: schema has { title, body } both markdown
  // Temperature 0.45 for more natural voice
```

**Connects to existing code:** Called from `GrowthOperator.runSocialLane`. The result is stored back into `SocialAsset.metadata.distributionDraft` for human review before the send route dispatches it.

**Complexity:** S

---

### Module 2.4 — HN Draft Assistant (manual-only)

**What it does.** Finds a relevant HN thread, drafts a contextual reply, and prepares a ready-to-paste comment. No write API — the user posts manually. The draft is surfaced in the approval queue with the target URL and body.

**This is entirely within existing infrastructure.** The HN connector already reads threads. The sequence worker already generates `community` channel touches. The only thing to add is:

**Modification to `src/operator-workers.ts`:** Adjust `runOperatorSequenceWorker` to specifically generate a `community_post` step with `metadata.platform = "hacker_news"` and `metadata.postManually = true` when the signal source is `hacker_news`. The body should be formatted as a direct HN comment (no markdown headers, conversational).

**Modification to `src/operator-api.ts`:** Add:
```
GET /v2/workspaces/:workspaceId/touches?touchType=community_post&platform=hacker_news&status=approved
  // Returns all HN drafts ready for manual posting
  // Frontend surfaces these with a "Copy to clipboard" button
```

**Complexity:** S

---

## Phase 3: Autonomous Operation

### Module 3.1 — Cron Tick (Cloudflare Cron Trigger)

**What it does.** Runs every 6 hours. Scans all configured signal sources for new signals, scores and prioritizes them, queues outreach for approval, and sends a digest summary to a configured webhook (Slack/email).

**Modification to `src/worker.ts`:**
```typescript
export default {
  async fetch(request, env, ctx) { ... },  // unchanged
  
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const config = workerEnvToConfig(env);
    const runtime = await createRuntime(config, { ensureSchema: false, seedOnBoot: false });
    await runtime.orchestrator.runAgentTick({
      trigger: event.cron,
      executionCtx: ctx,
    });
  }
}
```

**New file:** `src/agent-tick.ts`
```
export async function runAgentTick(input: {
  store: MarketingStore
  operator: GrowthOperator
  config: AppConfig
  trigger: string
}): Promise<AgentTickSummary>

  // Step 1 — Signal harvest (run in parallel, respect budget limits)
  //   - X search: 3 queries * 10 results = 30 tweets (~$0.15 at $0.005/read)
  //   - Reddit: 2 queries, public JSON fallback (free)
  //   - HN: top + ask (free Firebase API)
  //   - YC: 2 searches (free Algolia scrape)
  //   - GitHub: 1 query per tracked org (free with token)
  //   All collected as ExternalResearchDocument[], deduped by URL hash

  // Step 2 — Deduplication
  //   Hash each document URL + first 200 chars of content
  //   Skip if hash exists in store (new table: signal_hashes)

  // Step 3 — Batch ICP scoring
  //   For each new document, run runIcpScoringWorker (or keyword fallback)
  //   Only process documents scoring >= 40

  // Step 4 — Signal ingestion
  //   Call operator.ingestSignal for each qualified document
  //   autoGenerateSequence: true for score >= 65

  // Step 5 — Scheduled send dispatch
  //   Load all touches where metadata.scheduledFor <= now AND status = "approved"
  //   Call sendApprovedTouch for each

  // Step 6 — Digest
  //   Build summary: signals_found, signals_qualified, sequences_created, touches_sent
  //   POST to config.digestWebhookUrl if configured
  //   Also stores PerformanceSnapshot in DB

interface AgentTickSummary {
  signalsHarvested: number
  signalsQualified: number
  sequencesCreated: number
  touchesSent: number
  errors: string[]
  durationMs: number
}
```

**New schema additions (`sql/schema.sql`):**
```sql
create table if not exists signal_hashes (
  hash text primary key,
  workspace_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_signal_hashes_workspace on signal_hashes (workspace_id);

-- Add to operator_entities for cron run log
-- (PerformanceSnapshot entity type already exists in domain.ts)
```

**Wrangler config addition (`wrangler.jsonc`):**
```jsonc
"triggers": {
  "crons": ["0 */6 * * *"]
}
```

**New config keys:**
- `DIGEST_WEBHOOK_URL` (optional, Slack incoming webhook or similar)
- `CRON_SIGNAL_SOURCES` (comma-separated, e.g. `"x,reddit,hn,yc"`, defaults to all)
- `CRON_MAX_SIGNALS_PER_TICK` (int, default 50, budget guard)

**Connects to existing code:** `ResearchCoordinator` already has `syncX`, `syncReddit`, `syncHackerNews`, `syncYC`, `syncGitHub`. The tick calls these, then feeds results into `operator.ingestSignal`.

**Complexity:** L

---

### Module 3.2 — Chat Interface (Natural Language Agent)

**What it does.** Accepts free-text commands from the operator UI and routes them to the appropriate underlying methods. Examples: "find AI agent companies on YC batch W25", "what should I focus on today?", "draft a thread about our benchmark results", "show pending approvals".

**New file:** `src/chat-agent.ts`
```
export class ChatAgent
  constructor(options: {
    operator: GrowthOperator
    llm: LanguageModelProvider
    store: MarketingStore
    config: AppConfig
    researchCoordinator: ResearchCoordinator
  })

  async chat(input: {
    workspaceId: string
    message: string
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  }): Promise<ChatAgentResponse>

interface ChatAgentResponse {
  message: string
  actions: ChatAction[]  // list of things the agent did
  data?: unknown         // structured data to display (touches, signals, etc.)
}

interface ChatAction {
  type: "research" | "draft" | "approve" | "send" | "report" | "none"
  description: string
  result?: unknown
}
```

**Intent routing approach (no separate router LLM call — use one prompt with tool_use style):**

The chat prompt includes a routing schema:
```
schema: z.object({
  intent: z.enum(["hunt_prospects", "qualify_signal", "draft_content", "get_digest", "list_pending", "send_touch", "none"]),
  parameters: z.record(z.unknown()),
  response: z.string()
})
```

Dispatcher maps `intent` to method calls:
- `hunt_prospects` → calls `research.syncYC`, `research.syncX`, or `research.syncGitHub` based on parameters
- `qualify_signal` → calls `operator.ingestSignal`
- `draft_content` → calls `runContentDistributionWorker`
- `get_digest` → calls `operator.getWorkspaceDashboard`
- `list_pending` → calls `store.listTouches({ status: "approved" })`
- `send_touch` → calls `operator.sendApprovedTouch`

**Modification to `src/operator-api.ts`:**
```
POST /v2/workspaces/:workspaceId/chat
  Body: { message: string; history?: Array<{role, content}> }
  Returns: { message: string; actions: ChatAction[]; data?: unknown }
```

**Modification to `src/operator-ui.ts`:** The existing UI is minimal. Add a `renderChatApp` function that emits an HTML page with a text input, scrolling message history, and an action log panel. Uses `fetch("/v2/workspaces/{id}/chat")` via vanilla JS. No framework needed — this is an internal ops tool.

**Complexity:** L

---

## Phase 4: Feedback Loop and Polish

### Module 4.1 — People Data Labs Enrichment

**What it does.** Given a `ProspectPerson` and `ProspectAccount`, calls PDL's Person Enrich API (free 100/mo) to fill in role, seniority, LinkedIn URL, and tech stack signals. Falls back to Wappalyzer npm-based tech stack detection for the account domain.

**New file:** `src/enrichment.ts`
```
export class PeopleDataLabsClient
  async enrichPerson(input: {
    name?: string
    email?: string
    domain?: string
    linkedinUrl?: string
  }): Promise<PdlPersonResult | null>
    // GET https://api.peopledatalabs.com/v5/person/enrich?email=X&...
    // Headers: X-Api-Key
    // Returns: { name, job_title, job_company_website, linkedin_url, ... }

export class WappalyzerTechStackDetector
  async detect(domain: string): Promise<string[]>
    // Uses wappalyzer npm package: Wappalyzer.open(url).then(r => r.technologies.map(t => t.name))
    // Note: Wappalyzer npm is Node-only (uses Puppeteer). In Workers, use a lightweight fetch + regex heuristic:
    //   - Fetch the homepage HTML, look for known CDN patterns, script src patterns
    //   - Detect: next.js, react, vercel, fly.io, openai, anthropic, langchain etc.

export async function enrichProspectAccount(input: {
  account: ProspectAccount
  store: MarketingStore
  pdl: PeopleDataLabsClient
  wappalyzer: WappalyzerTechStackDetector
}): Promise<void>
  // Updates account.metadata.techStack, metadata.pdlEnriched, metadata.enrichedAt
  // Triggers re-scoring if tech stack contains AI/LLM frameworks
```

**New config keys:**
- `PDL_API_KEY` (optional)
- `WAPPALYZER_ENABLED` (boolean, default false — only works in Node runtime)

**Connects to existing code:** Called from `GtmOperator.ingestSignal` after account creation, and from the cron tick during the qualification step.

**Complexity:** M

---

### Module 4.2 — Engagement Feedback Loop

**What it does.** Closes the signal-to-outcome loop. When a touch gets a reply (detected via Resend reply webhook or manual mark), updates the opportunity stage, creates an Attribution record, and adjusts the ICP scoring weights in memory via RetainDB. Also tracks X engagement (likes, retweets, replies) for social touches.

**Modification to `src/growth-operator.ts`:**
```
async recordTouchEngagement(input: {
  touchId: string
  engagementType: "reply" | "click" | "open" | "like" | "retweet" | "booked" | "paid"
  metadata?: Record<string, unknown>
}): Promise<void>
  // 1. Load touch + sequence + opportunity + account
  // 2. Advance opportunity.stage appropriately
  // 3. Create Attribution record with channel and weight
  // 4. If engagementType === "booked": create Conversation record
  // 5. Store engagement signal in RetainDB memory (memoryProvider.ingest)
  //    Memory key: "engagement:{accountId}:{channel}:{engagementType}"
  //    This allows future ICP scoring to weight similar account profiles higher

async syncXEngagement(input: { workspaceId: string }): Promise<void>
  // For all sent X touches in last 7 days:
  //   GET /2/tweets/{id} with public_metrics
  //   Compare with stored metrics; record deltas as Attribution records
  //   Cost: ~$0.005/read * N touches — call at most once per 6h via cron
```

**Modification to `src/operator-api.ts`:**
```
POST /v2/workspaces/:workspaceId/touches/:touchId/engagement
  Body: { engagementType: "reply" | "click" | "open" | "booked" | "paid", metadata?: {} }
  // Human-triggered engagement recording (e.g. "they replied on LinkedIn, mark it")
```

**Complexity:** M

---

### Module 4.3 — LinkedIn Manual Assist Improvements

**What it does.** The existing LinkedIn connector reads public URLs. For the write side (LinkedIn DMs), the agent drafts the message and routes it to the human with a one-click "copy" action. Improve the experience so the frontend shows: the draft DM, a "Open LinkedIn profile" button, and a "Mark as sent" button that updates the touch.

**Modification to `src/operator-api.ts`:**
```
GET /v2/workspaces/:workspaceId/touches?channel=outbound&touchType=dm&platform=linkedin&status=approved
  // Returns LinkedIn DM drafts ready for manual dispatch

PATCH /v2/workspaces/:workspaceId/touches/:touchId
  Body: { status: "sent", metadata: { sentManually: true, sentAt: "..." } }
  // Marks a manually-dispatched touch as sent
```

**Modification to `src/operator-ui.ts`:** Add a "Manual Queue" panel for `postManually = true` touches (HN, LinkedIn). Shows draft text, target URL, and a "Mark Sent" button.

**Complexity:** S

---

### Module 4.4 — Performance Snapshots and Reporting

**What it does.** The existing `PerformanceSnapshot` entity in the domain model is defined but never written. Wire it up: after each cron tick and after key events (sequence created, touch sent, opportunity advanced), write a snapshot.

**Modification to `src/growth-operator.ts`:**
```
async snapshotPerformance(workspaceId: string): Promise<void>
  // Reads current pipeline counts (signal, touched, replied, booked, paid)
  // Writes PerformanceSnapshot to store
  // Compares to last snapshot: flags regressions (e.g. reply rate dropped >20%)

async getDailyDigest(workspaceId: string): Promise<DigestPayload>
  // Consolidates: new signals today, touches sent, replies received, open opportunities
  // Used by cron tick to build the digest webhook payload and by chat agent "what should I focus on?"
```

**Modification to `src/operator-api.ts`:**
```
GET /v2/workspaces/:workspaceId/performance
  // Returns last 30 snapshots as time series
  // Used by the UI to render a simple pipeline funnel

GET /v2/workspaces/:workspaceId/digest
  // Returns getDailyDigest output as JSON
  // The chat agent calls this for "focus" questions
```

**Complexity:** S

---

## Implementation Sequencing and Dependencies

```
Phase 1 (complete first):
  1.4 LLM ICP Scorer         — no external deps, improves everything downstream
  1.1 EmailFinder            — needed by 1.2
  1.2 ResendEmailClient      — needed by 1.3
  1.3 EmailSequenceExecutor  — depends on 1.1 + 1.2

Phase 2 (can start in parallel with late Phase 1):
  2.3 ContentDistributionWorker — no external deps, improves social lane
  2.1 XPublishingClient         — depends on X OAuth setup
  2.2 RedditPublishingClient    — uses existing REDDIT_BEARER_TOKEN
  2.4 HN Draft Assistant        — pure worker addition, minimal effort

Phase 3 (depends on Phase 1 + 2 being complete):
  3.1 CronTick                  — orchestrates everything from Phase 1+2
  3.2 ChatAgent                 — depends on all Phase 1+2 methods existing

Phase 4 (independent polish, run alongside Phase 3):
  4.3 LinkedIn Manual Assist    — UI-only, minimal
  4.4 Performance Snapshots     — no external deps
  4.1 PDL Enrichment            — external API, optional
  4.2 Engagement Feedback Loop  — depends on Phase 1 send infrastructure
```

---

## Summary of All New Files

| File | Phase | Purpose |
|---|---|---|
| `src/email-finder.ts` | 1 | GitHub commit extraction, SMTP pattern verify, Hunter lookup |
| `src/sending.ts` | 1 | Resend email client + batch sender |
| `src/social-publishers.ts` | 2 | X write client (post, thread, DM) + Reddit write client |
| `src/enrichment.ts` | 4 | PDL enrichment + Wappalyzer tech stack detection |
| `src/agent-tick.ts` | 3 | Cron tick orchestration loop |
| `src/chat-agent.ts` | 3 | Natural language chat dispatcher |

## Summary of All Modified Files

| File | Changes |
|---|---|
| `src/config.ts` | Add HUNTER_API_KEY, RESEND_*, X_ACCESS_TOKEN, X_OAUTH_*, REDDIT_CLIENT_*, PDL_API_KEY, DIGEST_WEBHOOK_URL, CRON_* |
| `src/domain.ts` | Add sentAt, externalMessageId to Touch; update MarketingStore interface with new store method signatures |
| `src/operator-workers.ts` | Add runIcpScoringWorker, runContentDistributionWorker |
| `src/growth-operator.ts` | Add sendApprovedTouch, sendApprovedXTouch, sendApprovedRedditTouch, recordTouchEngagement, snapshotPerformance, getDailyDigest |
| `src/operator-api.ts` | Add ~12 new routes (send, send-x, send-reddit, chat, performance, digest, webhooks/resend, manual queue) |
| `src/worker.ts` | Add `scheduled` export for Cloudflare Cron |
| `src/gtm-operator.ts` | Replace keyword ICP scorer with runIcpScoringWorker call |
| `src/operator-ui.ts` | Add chat panel, manual queue panel, performance funnel view |
| `src/store/postgres-store.ts` | Add methods for signal_hashes, sentAt/externalMessageId touch updates, performance snapshot writes |
| `src/store/in-memory-store.ts` | Stub implementations for new store methods |
| `sql/schema.sql` | Add signal_hashes table; add sentAt, externalMessageId columns to touches |
| `wrangler.jsonc` | Add cron triggers block, optionally Hyperdrive binding |

---

### Critical Files for Implementation

- `/c/Users/user/Downloads/context/marketing-orchestrator/src/growth-operator.ts` — Core orchestration class where all new `sendApproved*` and agent loop methods attach; the central nerve of the system
- `/c/Users/user/Downloads/context/marketing-orchestrator/src/operator-workers.ts` — Pattern to follow for all new LLM workers (ICP scorer, content distribution worker); the schema + prompt structure is already established and must be matched exactly
- `/c/Users/user/Downloads/context/marketing-orchestrator/src/operator-api.ts` — All new HTTP routes and the Resend webhook handler go here; also where `ResearchCoordinator` is wired, so new publisher clients get injected at the same construction point
- `/c/Users/user/Downloads/context/marketing-orchestrator/src/worker.ts` — The Cloudflare Worker entrypoint; the `scheduled` export for Cron Triggers must be added here alongside the existing `fetch` export
- `/c/Users/user/Downloads/context/marketing-orchestrator/src/config.ts` — All new API keys and feature flags must be added to `EnvSchema` and `AppConfig` here first, before any module can use them; everything else branches from this file
