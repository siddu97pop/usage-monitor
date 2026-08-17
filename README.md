---
tags:
  - project
  - usage-multi-model
---

# LexiTools Usage Monitor

Private single-page dashboard for tracking AI usage across Codex (ChatGPT subscription), Claude (subscription), and Ollama (Pro plan).

**Live target:** `usage.lexitools.tech`

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styles | Tailwind CSS |
| Charts | Recharts |
| ORM | Prisma |
| Database | PostgreSQL (Vercel Postgres / Neon) |
| Deploy | Vercel |

---

## Quick Start

### 1. Install dependencies

```bash
cd usage-monitor
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `DATABASE_URL` and `DIRECT_URL` from your Vercel Postgres (Neon) dashboard.

### 3. Push schema & seed

```bash
npm run db:push      # push schema to DB (no migration files)
npm run db:seed      # load mock seed data
```

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
usage-monitor/
├── app/
│   ├── layout.tsx                  # Root layout, fonts, global styles
│   ├── page.tsx                    # Overview page — 3 provider cards
│   ├── statistics/page.tsx         # Detailed Statistics page
│   ├── globals.css                 # Tailwind + custom overrides
│   └── api/
│       ├── usage/route.ts          # GET /api/usage — Overview provider cards
│       ├── statistics/route.ts     # GET /api/statistics — Detailed Statistics data
│       └── proxy/ollama/route.ts   # Ollama proxy endpoint
├── components/
│   ├── Header.tsx                  # Title + refresh button
│   ├── PageTabs.tsx                # Overview / Detailed Statistics nav
│   ├── ProviderCard.tsx            # One card per provider (Overview)
│   ├── PlanUsageLimits.tsx         # Plan-window usage bars
│   ├── MiniBarChart.tsx            # Recharts bar chart (hourly / weekly, Overview)
│   └── StatisticsDashboard.tsx     # Detailed Statistics — charts, session explorer
├── lib/
│   ├── prisma.ts                   # Prisma client singleton — used for reads that stay server-side
│   ├── usage-service.ts            # Overview aggregation — DB queries → ProviderStats
│   ├── analytics.ts                # Analytics types, rate cards, calculateEstimates()
│   ├── claude-usage.ts             # Claude plan-window usage
│   ├── codex-usage.ts              # Codex plan-window usage
│   ├── ollama-sync.ts              # Ollama health check
│   └── mock-data.ts                # Static fallback data (used if DB is empty)
├── scripts/
│   ├── analytics-sync.mjs          # Cron: parses Claude/Codex JSONL → Supabase (Detailed Statistics)
│   ├── claude-sync.mjs             # Cron: Claude plan-window sync
│   ├── codex-sync.mjs              # Cron: Codex plan-window sync
│   ├── codex-rate-limits.mjs       # Cron: Codex rate-limit snapshot
│   └── verify-analytics-rates.ts   # `npm test` — rate-card assertions
├── prisma/
│   └── schema.prisma               # Data model (UsageRecord, SyncLog, ...)
├── types/
│   └── usage.ts                    # Shared TypeScript types
└── .env.local
```

The Detailed Statistics page (`/statistics`) reads via **Supabase PostgREST** (`SUPABASE_URL` + `SUPABASE_ANON_KEY`), not Prisma — `app/api/statistics/route.ts` fetches `UsageRecord` rows directly over HTTP. Prisma/`DIRECT_URL` is still used by the sync scripts (`scripts/*.mjs`, run from cron every 5 minutes on the VPS) to write those rows.

---

## Data Sources — Important Note

| Provider | Data Type | Sync | Detail |
|----------|-----------|------|--------|
| **Codex** | ChatGPT subscription sessions | `scripts/codex-sync.mjs` + `scripts/analytics-sync.mjs` (cron, 5 min) | Parses local `~/.codex/sessions` rollout JSONL |
| **Claude** | Anthropic subscription sessions | `scripts/claude-sync.mjs` + `scripts/analytics-sync.mjs` (cron, 5 min) | Parses local `~/.claude/projects` JSONL — counts, enums, and model IDs only; conversation text never leaves the VPS |
| **Ollama** | Local + Pro plan requests | `lib/ollama-sync.ts` (live health check) | Proxy logging or manual import |

Codex and Claude are **subscription-based**, not API-billed. `analytics-sync.mjs` reads local session logs on the VPS and upserts session-level telemetry (token counts, tool-call counts, model IDs, timestamps) to Supabase — never prompt or response text. `lib/analytics.ts` turns that telemetry into API-equivalent cost *estimates*, clearly labelled as estimates, not subscription charges.

---

## Adding Real Usage Data

### Option A — Manual import (v1)

Insert records directly via Prisma Studio:

```bash
npm run db:studio
```

Or use a script:

```ts
// scripts/import-usage.ts
import { prisma } from '../lib/prisma';

await prisma.usageRecord.create({
  data: {
    provider: 'claude',
    source_type: 'manual',
    timestamp: new Date(),
    usage_value: 12,
    usage_unit: 'messages',
    sync_status: 'manual',
    notes: 'Manually counted from session',
  },
});
```

### Option B — Ollama proxy logging

Run Ollama behind a lightweight proxy that POSTs to `/api/ingest` on each request. (Ingestion endpoint not included in v1 — add as needed.)

---

## Vercel Deployment

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "feat: LexiTools Usage Monitor v1"
gh repo create lexitools-usage-monitor --private --source=. --push
```

### 2. Deploy to Vercel

```bash
vercel --prod
```

Or connect the repo in the Vercel dashboard.

### 3. Add Vercel Postgres (Neon)

In the Vercel dashboard:
1. Go to **Storage → Create Database → Postgres (Neon)**
2. Copy `DATABASE_URL` and `DIRECT_URL` to your Vercel environment variables
3. Run migrations: `npm run db:push`
4. Seed: `npm run db:seed`

---

## Custom Domain

Point `usage.lexitools.tech` to Vercel:

1. In Vercel: **Project → Settings → Domains → Add `usage.lexitools.tech`**
2. In your DNS (wherever `lexitools.tech` is managed):
   - Add a `CNAME` record: `usage` → `cname.vercel-dns.com`
   - Or an `A` record if using the root
3. Vercel will auto-provision the SSL certificate

---

## Adding a New Provider

1. Add the provider key to `types/usage.ts` → `Provider` union
2. Add metadata to `PROVIDER_META` in `lib/usage-service.ts`
3. Add mock data to `lib/mock-data.ts`
4. Add seed records in `prisma/seed.ts`

No other changes needed — the card grid is data-driven.

---

## Roadmap

- [ ] Manual import UI (drag-and-drop CSV)
- [ ] Usage alerts (threshold notifications)
- [ ] Cost projections (weekly / monthly)
- [ ] Export to CSV
- [ ] OAuth API `extra_usage` block (real credit spend vs. the $2000 monthly limit) — see `V3_IMPLEMENTATION_PLAN.md`
