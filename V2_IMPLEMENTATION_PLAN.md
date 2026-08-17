---
tags:
  - project
  - plan
  - usage-multi-model
---

# Usage Monitor V2 — Detailed Statistics

## Goal

Add a separate **Detailed Statistics** tab without changing the existing Overview page. The new surface turns local Claude Code and Codex telemetry into useful token, efficiency, performance, project, model, and cost-equivalent analytics.

## Reporting principles

- Subscription spend and usage estimates are different figures.
- Claude cost is labelled **API-equivalent estimate**, never billed cost.
- Codex is shown as estimated credits using the applicable token rate card.
- Raw prompts, responses, tool output, file contents, and credentials never leave the VPS.
- Every statistic carries a data-quality state: measured, estimated, partial, or unavailable.
- Display dates and grouping use Dubai time (`Asia/Dubai`).

## Phase 1 — Analytics data foundation

- Parse Claude JSONL assistant usage into session-level records.
- Parse Codex rollout token-count events into session-level records.
- Preserve input, output, cache, reasoning, context, duration, project, and model dimensions in structured payloads.
- Upsert by stable provider/session identity so repeated syncs are safe.
- Backfill available local history and keep the five-minute VPS sync incremental.
- Add a read-only statistics API with date-range and provider filters.

**Verification:** deterministic parser tests against sanitized fixtures, idempotent repeated sync, and API totals reconciled against source records.

## Phase 2 — Core Detailed Statistics tab

- Add `Overview` and `Detailed Statistics` navigation.
- Keep the Overview markup and provider cards unchanged.
- Add date range and provider filters.
- Add summary metrics for tokens, sessions, active days, average tokens/session, API-equivalent cost, and Codex credits.
- Add daily stacked token trend and provider/model distribution.
- Clearly separate measured usage from estimated monetary values.

**Verification:** responsive desktop/mobile rendering, keyboard-accessible tabs and filters, chart tooltips and legends, empty/error/loading states.

## Phase 3 — Efficiency, patterns, and session explorer

- Cache-hit ratio, output/input ratio, context utilization, and compaction rate.
- Day/hour activity heatmap in Dubai time.
- Project and model breakdowns.
- Codex task duration and time-to-first-token summaries where recorded.
- Paginated session explorer showing metadata only, never conversation content.
- Current plan-window status and reset timing alongside historical usage.

**Verification:** aggregation edge cases, timezone boundaries, small-screen table behavior, and no sensitive text in API responses.

## Phase 4 — Production hardening and release

- Run TypeScript/build checks and parser tests.
- Perform visual and accessibility review with the live local app.
- Backfill the production data store and confirm recurring sync.
- Validate the protected production route after deployment.
- Commit only V2-related files, push to GitHub, and verify Vercel production.

## Initial rate-card policy

Pricing lives in versioned application data with effective dates. Unknown/future models do not inherit a guessed price: their cost displays as unavailable until a matching rate is added. Historical calculations retain the rate version used.

## Out of scope for V2

- Changing the current Overview layout or provider cards.
- Uploading conversation content.
- Presenting subscription estimates as invoices.
- Depending on Enterprise-only analytics APIs for personal-plan data.
- Ollama deep analytics beyond records already captured by the proxy.
