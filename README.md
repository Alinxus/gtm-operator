# RetainDB Growth Operator

Separate backend service and lane-based growth operator for RetainDB founder-led marketing and distribution.

## What it does

- Grounds campaigns in a proof-backed truth pack and first-class claim registry.
- Generates channel-specific assets with claim citations.
- Runs a critic/reviewer pass before anything can move forward.
- Pauses on approval, including human overrides for critic rejections.
- Writes approved learnings back into RetainDB memory.
- Ingests real GTM signals and ranks who matters, why they matter, and what to do next.
- Turns one signal into an approval-ready outreach path across outbound, replies, social, community, and landing variants.
- Ships a browser-accessible operator app plus a Vercel-ready frontend with Today, Accounts, Approvals, Social, SEO/GEO, Campaigns, Publishing, and Outcomes surfaces.
- Can sync research from websites/docs, GitHub, X, Reddit, Hacker News, YC company search, LinkedIn public URLs, and form submissions.
- Supports model-backed specialist workers for account research and sequence generation when an LLM provider is configured.

## Scope
- Postgres-backed workflow storage.
- RetainDB as the default memory provider.
- Backend/API plus UI surfaces (built-in app + dedicated frontend package).
- Approval before send or publish.
- No auto-publish.
- No paid ads automation.

## Local development

```bash
cd marketing-orchestrator
npm install
npm run dev
```

The service seeds the default RetainDB brand and a default GTM workspace on boot. There is no dedicated CLI in the product surface; the intended interfaces are HTTP APIs and UI apps.

Frontend (Vercel-ready):

```bash
cd marketing-orchestrator/frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_OPERATOR_API_BASE_URL` in `frontend/.env.local`.

## Environment

Copy `.env.example` to `.env` and set a real `DATABASE_URL` plus `RETAINDB_API_KEY`.

By default the service expects:

- Postgres for workflow storage
- `retaindb-http` as the memory provider
- `disabled` as the default LLM provider until you add `OPENAI_API_KEY`
- seed-on-boot enabled for the default RetainDB dogfood tenant

There are explicit escape hatches for local offline work:

- `ALLOW_IN_MEMORY_STORE=true`
- `ALLOW_MOCK_MEMORY_PROVIDER=true`

Optional connector/model settings:

- `DEFAULT_LLM_PROVIDER=openai`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4.1-mini`
- `RETAINDB_API_BASE_URL=https://api.retaindb.com`
- `GITHUB_TOKEN=...`
- `GITHUB_APP_ID=...`
- `GITHUB_APP_PRIVATE_KEY=...`
- `GITHUB_APP_INSTALLATION_ID=...`
- `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000`
- `CLOUDFLARE_ACCOUNT_ID=...`
- `CLOUDFLARE_API_TOKEN=...`
- `X_BEARER_TOKEN=...`
- `REDDIT_BEARER_TOKEN=...`
- `LINKEDIN_ACCESS_TOKEN=...`

GitHub can use either a personal token or a GitHub App installation token. Reddit now supports a public-search fallback when `REDDIT_BEARER_TOKEN` is missing, though a bearer token is still the more robust path for rate limits and long-running sync jobs. Hacker News and YC discovery work from public endpoints. If `OPENAI_API_KEY` is configured, the operator can also ingest grounded web discovery through OpenAI web search. If `CLOUDFLARE_ACCOUNT_ID` plus `CLOUDFLARE_API_TOKEN` are configured, website and LinkedIn sync can fall back to Cloudflare Browser Rendering for JS-heavy public pages.

## Cloudflare deployment

This service now includes a Cloudflare Worker entrypoint in [src/worker.ts](/C:/Users/user/Downloads/context/marketing-orchestrator/src/worker.ts) plus a starter [wrangler.jsonc](/C:/Users/user/Downloads/context/marketing-orchestrator/wrangler.jsonc).

Suggested production shape:

- Cloudflare Workers for the API and operator app
- Hyperdrive in front of Neon/Postgres
- RetainDB HTTP memory as the default external memory layer
- Vercel frontend calling the Worker API over CORS
- Optional Browser Rendering later for public-page research on X/LinkedIn

Useful commands:

```bash
npm run seed
npm run dev:worker
npm run deploy:worker
```

Notes:

- The Worker runtime intentionally skips local filesystem schema bootstrap, so run `npm run seed` from Node/CI against the target database before deploying a fresh environment.
- Set secrets with `wrangler secret put`, especially `OPENAI_API_KEY` and `RETAINDB_API_KEY`.
- If you add a Hyperdrive binding named `HYPERDRIVE`, the Worker will use its `connectionString` automatically when `DATABASE_URL` is not provided directly.

## X without paid API

Cloudflare helps with hosting and future browser-based page rendering, but it does not remove X's official API paywall for broad search.

The realistic low-cost stack is:

- use Reddit, Hacker News, YC, GitHub, websites/docs, and forms for broad discovery
- use X only for manual/public URL ingest or future browser-rendered page research
- treat X as a supporting signal source, not the backbone of first-user acquisition

## App

- `GET /app`
- `GET /app/:workspaceId`

## Frontend package

- `marketing-orchestrator/frontend`
- routes: `/workspaces`, `/workspaces/:workspaceId/today`, `/accounts`, `/approvals`, `/social`, `/seo`, `/campaigns`, `/publishing`, `/outcomes`
- designed to mirror `retaindb-frontend` dashboard style while consuming the same `/v2` API

## API

### V1 campaign orchestration

- `POST /v1/brands`
- `POST /v1/campaigns`
- `POST /v1/runs`
- `POST /v1/assets/:assetId/approve`
- `POST /v1/assets/:assetId/reject`
- `POST /v1/assets/:assetId/override`
- `GET /v1/runs/:runId`
- `GET /v1/runs/:runId/stream`

### V2 GTM operator

- `GET /v2/workspaces`
- `GET /v2/workspaces/:workspaceId/dashboard`
- `POST /v2/workspaces/:workspaceId/signals`
- `POST /v2/workspaces/:workspaceId/forms/ingest`
- `POST /v2/workspaces/:workspaceId/research/website`
- `POST /v2/workspaces/:workspaceId/research/web-search`
- `POST /v2/workspaces/:workspaceId/research/github`
- `POST /v2/workspaces/:workspaceId/research/x`
- `POST /v2/workspaces/:workspaceId/research/reddit`
- `POST /v2/workspaces/:workspaceId/research/hacker-news`
- `POST /v2/workspaces/:workspaceId/research/yc`
- `POST /v2/workspaces/:workspaceId/research/linkedin`
- `GET /v2/workspaces/:workspaceId/opportunities`
- `GET /v2/workspaces/:workspaceId/approvals`
- `POST /v2/workspaces/:workspaceId/approvals/batch`
- `POST /v2/touches/:touchId/approve`
- `POST /v2/touches/:touchId/override`
- `POST /v2/touches/:touchId/revise`
- `POST /v2/touches/:touchId/sent`
- `POST /v2/workspaces/:workspaceId/conversations`

## Notes

The service is intentionally open-source-friendly and tenant-scoped. RetainDB is the first dogfood tenant, but the architecture is adapter-based so other brands can use the same orchestration engine.
