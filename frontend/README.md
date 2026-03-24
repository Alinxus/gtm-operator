# RetainDB Growth Operator Frontend

Vercel-ready frontend for the RetainDB Growth Operator backend (`/v2` API).

## Design system

This frontend intentionally mirrors the `retaindb-frontend` dashboard language:

- same core font stack (`Playfair Display`, `DM Sans`, `JetBrains Mono`)
- same neutral palette, borders, spacing cadence, and dashboard shell rhythm
- same “clean infra console” feel (proof-first, direct, low-noise UI)

## Routes

- `/workspaces`
- `/workspaces/:workspaceId/today`
- `/workspaces/:workspaceId/accounts`
- `/workspaces/:workspaceId/approvals`
- `/workspaces/:workspaceId/social`
- `/workspaces/:workspaceId/seo`
- `/workspaces/:workspaceId/campaigns`
- `/workspaces/:workspaceId/publishing`
- `/workspaces/:workspaceId/outcomes`

## Run locally

```bash
cd marketing-orchestrator/frontend
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_OPERATOR_API_BASE_URL` to your backend API, for example:

- local Node backend: `http://localhost:4000`
- Cloudflare Worker backend: `https://your-worker.your-subdomain.workers.dev`

## Deploy

- Deploy this folder to Vercel.
- Set `NEXT_PUBLIC_OPERATOR_API_BASE_URL` in Vercel env vars.
- Ensure backend `CORS_ALLOWED_ORIGINS` includes your Vercel URL.
