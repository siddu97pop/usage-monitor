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
│   ├── layout.tsx           # Root layout, fonts, global styles
│   ├── page.tsx             # Main page — fetches & displays 3 provider cards
│   ├── globals.css          # Tailwind + custom overrides
│   └── api/usage/route.ts   # GET /api/usage — returns ProviderStats[]
├── components/
│   ├── Header.tsx           # Title + refresh button
│   ├── ProviderCard.tsx     # One card per provider
│   └── MiniBarChart.tsx     # Recharts bar chart (hourly / weekly)
├── lib/
│   ├── prisma.ts            # Prisma client singleton
│   ├── mock-data.ts         # Static fallback data (used if DB is empty)
│   └── usage-service.ts     # Aggregation logic — DB queries → ProviderStats
├── prisma/
│   ├── schema.prisma        # Data model
│   └── seed.ts              # Seed script (7 days of mock hourly data)
├── types/
│   └── usage.ts             # Shared TypeScript types
└── .env.example
```

---

## Data Sources — Important Note

| Provider | Data Type | v1 Strategy | Future |
|----------|-----------|-------------|--------|
| **Codex** | ChatGPT subscription messages | Manual import / seed data | OpenAI Compliance API (cloud Codex only) |
| **Claude** | Anthropic subscription messages | Manual import / seed data | Browser-assisted session capture |
| **Ollama** | Local + Pro plan requests | Proxy logging or manual import | Ollama Pro API when available |

Codex and Claude are **subscription-based**, not API-billed. Neither exposes a standard usage API for individual accounts. The system is designed to accept manually imported usage records and will upgrade to automated ingestion as provider APIs become available.

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
- [ ] Ollama proxy endpoint (`/api/ingest/ollama`)
- [ ] Usage alerts (threshold notifications)
- [ ] Cost projections (weekly / monthly)
- [ ] Export to CSV
