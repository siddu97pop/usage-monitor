---
tags:
  - project
  - usage-multi-model
---

# Usage Monitor v3 — Capture the New Claude Telemetry

## Context

The LexiTools Usage Monitor (`projects/Usage Multi Model/usage-monitor`) aggregates Claude Code and Codex session logs into Supabase and renders them at `/` (Overview) and `/statistics`. Its Claude parser (`scripts/analytics-sync.mjs:59-109`) was written against an older JSONL shape and reads only six fields from `message.usage`.

Recent Claude Code releases emit substantially richer telemetry. Verified against live logs in `~/.claude/projects` (62 files, CC versions 2.1.97 → 2.1.228):

| Signal | Location | Status today |
|---|---|---|
| `claude-opus-5` | `message.model` — **701K tokens, the largest model in the data** | **Not in `CLAUDE_USD_RATES` → every Opus 5 session shows "Unavailable"** |
| `output_tokens_details.thinking_tokens` | `message.usage` | Ignored; `reasoning_tokens` hardcoded to `0` for Claude (`analytics-sync.mjs:95`) |
| `cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens` | `message.usage` | Ignored. Live split is 10.56M (1h) vs 0.75M (5m); the two tiers price differently, so one flat `cacheWrite` rate is wrong for one of them |
| `service_tier`, `speed` | `message.usage` | Ignored (fast mode vs standard) |
| `isSidechain` + `agent-*.jsonl` files | top-level | Ignored — subagent spend is invisible (100 sidechain messages, 5 agent files) |
| `tool_use` `name` | assistant content | Only counted, never named (Bash 699, Edit 122, Read 110, …) |
| `stop_reason` | `message` | Ignored — `max_tokens` truncations undetectable |
| `effort`, `entrypoint`, `version`, `gitBranch` | top-level | Ignored |

Outcome: correct cost figures for current models, new behavioural dimensions, and a `/statistics` page reorganised into sub-tabs so it isn't one long scroll.

**Explicitly out of scope** (decided with Sid):
- No session text leaves the VPS. `ai-title` and `last-prompt` records exist in the JSONL but must **not** be synced. The V2 privacy principle (`V2_IMPLEMENTATION_PLAN.md:15-21`) stands unchanged.
- The OAuth API's `extra_usage` block (real credit spend vs the $2000 monthly limit) is deferred to a later build.
- Overview page layout is unchanged.

---

## Phase 1 — Pricing correctness (`lib/analytics.ts`)

This phase alone fixes the headline defect and is independently verifiable.

1. **Add the missing model IDs to `CLAUDE_USD_RATES` (`lib/analytics.ts:108-121`).** At minimum `claude-opus-5`. **Do not guess the numbers** — confirm current published per-million rates from Anthropic's pricing docs before writing them, and re-confirm the existing `claude-sonnet-5` / `claude-fable-5` entries at the same time. Keep the existing policy of listing only stable public IDs; unknown model → `null` → UI shows "Unavailable".
2. **Split cache-write pricing by TTL.** Widen the rate type to `{ input, cacheRead, cacheWrite5m, cacheWrite1h, output }` and price each bucket from the new payload fields. Where a model has no published 1h rate, derive it from the documented multiplier rather than reusing the 5m number.
3. **Route `thinking_tokens` into `reasoning_tokens`** so the existing reasoning series on the daily area chart populates for Claude, not just Codex. Thinking tokens are already counted inside `output_tokens` — treat `reasoning_tokens` as an informational subset and do **not** add it again to the cost total or to `totalTokens`.
4. **Extend `scripts/verify-analytics-rates.ts`** (run by `npm test`) with cases covering `claude-opus-5`, the 1h vs 5m cache split, and the no-double-count assertion for thinking tokens.

**Verify:** `npm test`, then load `/statistics` and confirm the "API-equivalent $" tile and the Session Explorer's Estimate column are populated for recent Opus 5 sessions instead of "Unavailable".

## Phase 2 — Richer extraction (`scripts/analytics-sync.mjs`)

Rewrite `parseClaude` (`:59-109`) to emit `analytics_version: 3`. All additions are counts and enums — no free text.

Add to the payload:
- `thinking_tokens`, `cache_creation_1h_tokens`, `cache_creation_5m_tokens`
- `tool_breakdown`: `{ [toolName]: count }` from `content[].type === 'tool_use'` items
- `sidechain_messages`, `sidechain_tokens` — from `isSidechain === true` rows. Agent files (`agent-*.jsonl`) currently parse as standalone sessions; attribute them to their parent session where the filename or `sessionId` allows, otherwise flag with `is_agent_session: true` so they can be excluded from session counts.
- `stop_reasons`: `{ [reason]: count }`
- `service_tiers`, `speeds`: `{ [value]: count }` (fast-mode detection)
- `effort`, `entrypoint`, `cc_version`, `git_branch` — last-seen scalar per session
- Keep all existing v2 fields unchanged so v2 rows stay readable.

Mirror the new fields in `AnalyticsPayload` and `AnalyticsSession` (`lib/analytics.ts:5-40`) and in the mapper in `app/api/statistics/route.ts:66-95`. Every new field must be optional and default safely — v2 rows in Supabase will lack them.

**Verify:** run `node scripts/analytics-sync.mjs` manually and inspect one upserted row's `raw_payload` in Supabase for `analytics_version: 3` plus a populated `tool_breakdown`.

## Phase 3 — Backfill + hardening

1. **Backfill.** The sync window is capped by `DAYS_TO_SYNC` and an `mtime` cutoff (`analytics-sync.mjs:162-172`). Run a one-off wide-window pass to re-upsert every session still on disk at v3. Upserts key on `notes` (`analytics-v2:claude:<sessionId>`) so this is idempotent — **keep that key string as-is** so existing rows are updated rather than duplicated. Sessions whose JSONL has been pruned stay at v2 and remain correctly reported as partial.
2. **Raise the caps in `app/api/statistics/route.ts`.** `limit=3000` (`:52`) silently truncates a 90-day window, and `sessions.slice(0, 100)` (`:144`) caps the explorer. Page through PostgREST with `Range` headers until exhausted, and raise the returned session list (the UI already paginates with "Show 10 more").
3. **Fix the O(n²) data-quality loop (`:147-148`)** — `rows.find(...)` runs inside a `filter` over up to 3000 rows. Read `analytics_version` off the already-mapped session object instead, and count v3 / v2 / pre-v2 as three tiers.
4. **Update `README.md`** — its structure section and roadmap are stale (still describes `mock-data`, `MiniBarChart`, and Prisma reads; the app now reads via Supabase REST).

**Verify:** `/api/statistics?days=90` returns a session count matching a direct Supabase row count for the same window.

## Phase 4 — Sub-tabs in `/statistics`

Split `components/StatisticsDashboard.tsx` into three client-side sub-tabs below the existing provider/range filters. Reuse the existing `PageTabs` styling and the local `Metric`, `EfficiencyItem`, `ChartTooltip`, and `ActivityHeatmap` helpers rather than writing new ones. Keep the summary metric strip and the data-quality footer visible across all three.

- **Tokens & Cost** — existing summary strip, daily stacked area, provider share, models, projects. Add a cache-write TTL split (1h vs 5m) to the token chart or as an efficiency row.
- **Behaviour** — new: tool-mix bar chart (top ~10 tools), main-thread vs subagent token split, activity heatmap (moved here), entrypoint and reasoning-effort breakdown.
- **Quality** — existing efficiency list (cache hit ratio, output/input, context utilisation, duration, TTFT, compactions), plus new `stop_reason` distribution highlighting `max_tokens` truncations, fast-mode vs standard share, and CC version cohorts.

Session Explorer stays at the bottom, outside the sub-tabs, identified by project + model as today.

Follow `ui-ux-pro-max` for any new chart work and match the existing dark palette (`#111118` surfaces, `#1e1e2e` borders, emerald accent). Charts must degrade gracefully when a range contains only v2 rows — show the "N legacy sessions contain partial detail" state rather than an empty chart.

**Verify:** load `/statistics` at 1/7/30/90-day ranges and each provider filter; confirm no console errors, no horizontal body scroll on mobile width, and that every new panel renders a sensible empty state on a range with no v3 data.

---

## Critical files

- `scripts/analytics-sync.mjs` — parser rewrite (Phases 2, 3)
- `lib/analytics.ts` — rate cards, payload/response types, `calculateEstimates` (Phases 1, 2)
- `app/api/statistics/route.ts` — mapping, aggregation, paging, data quality (Phases 2, 3)
- `components/StatisticsDashboard.tsx` — sub-tabs and new panels (Phase 4)
- `scripts/verify-analytics-rates.ts` — rate-card tests (Phase 1)
- `README.md` — docs refresh (Phase 3)

## Rollout

Sync scripts run from cron every 5 min against the systemd instance on `:3099`; the Vercel deployment reads the same Supabase project. Deploy phases in order — Phase 1 is shippable on its own. After Phase 2, confirm the cron run still completes before pushing to Vercel.

## Logging

Per `CLAUDE.md`, after each phase append a 2–3 line entry to `logs/sessions.md` and write the detail file at `logs/2026/08/2026-08-17-usage-monitor-v3.md` with frontmatter `tags: [log, usage-multi-model]`. Update the **LexiTools Usage Monitor** block in `memory/projects.md` in place when the build lands, and add a row to `memory/decisions.md` for the "no session text leaves the VPS" reaffirmation.
