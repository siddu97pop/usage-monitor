#!/usr/bin/env node
/**
 * codex-sync.mjs — Syncs Codex session data from ~/.codex/state_5.sqlite
 * into the Supabase UsageRecord + SyncLog tables.
 *
 * Run manually:  node scripts/codex-sync.mjs
 * Run via cron:  every 5 min — "node /path/to/scripts/codex-sync.mjs >> /tmp/codex-sync.log 2>&1"
 *
 * Env vars required (set in .env.local or export before running):
 *   DIRECT_URL — postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
 */

import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'module';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { normalizeRateLimitSnapshot, readCodexRateLimits } from './codex-rate-limits.mjs';
const require = createRequire(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────

const DB_PATH      = path.join(os.homedir(), '.codex', 'state_5.sqlite');
const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const ENV_PATH = path.join(import.meta.dirname, '..', '.env.local');

// Load .env.local if present
if (existsSync(ENV_PATH)) {
  const lines = readFileSync(ENV_PATH, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL not set. Add it to .env.local or export it.');
  process.exit(1);
}

if (!existsSync(DB_PATH)) {
  console.log('Codex SQLite DB not found — skipping sync.');
  process.exit(0);
}

// ── Read Codex sessions from SQLite ──────────────────────────────────────────

const sqlite = new DatabaseSync(DB_PATH, { readonly: true });

// Only sync sessions updated in the last 7 days
const since = Math.floor(Date.now() / 1000) - 7 * 86400;

const sessions = sqlite
  .prepare(
    `SELECT id, created_at, updated_at, tokens_used, model, source
     FROM threads
     WHERE updated_at >= ? AND tokens_used > 0
     ORDER BY created_at ASC`
  )
  .all(since);

sqlite.close();

if (sessions.length === 0) {
  console.log(`[${new Date().toISOString()}] No sessions to sync.`);
  process.exit(0);
}

console.log(`[${new Date().toISOString()}] Syncing ${sessions.length} Codex sessions...`);

// ── Connect to Supabase via pg ────────────────────────────────────────────────

const { default: pg } = await import('pg').catch(() => {
  console.error('Missing dependency: npm install pg');
  process.exit(1);
});

const client = new pg.Client({ connectionString: DIRECT_URL });
await client.connect();

// ── Upsert each session as a UsageRecord ─────────────────────────────────────

let synced = 0;
let updated = 0;

for (const s of sessions) {
  const externalId = `codex-${s.id}`;
  const timestamp = new Date(s.created_at * 1000).toISOString();

  // Update active sessions as their cumulative token count grows.
  const existing = await client.query(
    `SELECT id FROM "UsageRecord" WHERE notes = $1 AND provider = 'codex' LIMIT 1`,
    [externalId]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE "UsageRecord"
       SET timestamp = $1, tokens = $2, model_name = $3, sync_status = 'synced', updated_at = NOW()
       WHERE id = $4`,
      [timestamp, s.tokens_used || null, s.model || 'unknown', existing.rows[0].id]
    );
    updated++;
    continue;
  }

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);

  await client.query(
    `INSERT INTO "UsageRecord"
      (id, provider, source_type, timestamp, usage_value, usage_unit,
       tokens, model_name, sync_status, notes, updated_at)
     VALUES ($1, 'codex', 'subscription', $2, 1, 'sessions',
             $3, $4, 'synced', $5, NOW())`,
    [id, timestamp, s.tokens_used || null, s.model || 'unknown', externalId]
  );
  synced++;
}

// ── Read rate-limit data from latest rollout JSONL ────────────────────────────

function listJsonlFiles(dir) {
  const results = [];
  function walk(d) {
    try {
      for (const entry of readdirSync(d)) {
        const full = path.join(d, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) walk(full);
          else if (entry.endsWith('.jsonl')) results.push({ path: full, mtime: st.mtimeMs });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

let rateLimitPayload = null;
let rateLimitTimestamp = -Infinity;
try {
  rateLimitPayload = await readCodexRateLimits();
} catch (error) {
  console.warn(`[${new Date().toISOString()}] Codex app-server rate limits unavailable: ${error.message}`);
}

// Older Codex clients wrote the snapshot into rollout JSONL. Keep this as a
// fallback so the monitor remains compatible if the app-server is unavailable.
if (!rateLimitPayload && existsSync(SESSIONS_DIR)) {
  const weekAgoMs = Date.now() - 7 * 86_400_000;
  for (const { path: file, mtime } of listJsonlFiles(SESSIONS_DIR)) {
    if (mtime < weekAgoMs) break;
    try {
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line);
          const rl = d?.payload?.rate_limits;
          if (rl?.primary || rl?.secondary) {
            const observedAt = typeof d.timestamp === 'string' ? d.timestamp : null;
            const timestamp = observedAt ? Date.parse(observedAt) : mtime + index / Math.max(lines.length, 1);
            if (!Number.isFinite(timestamp) || timestamp <= rateLimitTimestamp) continue;
            const normalized = normalizeRateLimitSnapshot(rl, observedAt ?? new Date(timestamp).toISOString());
            if (!normalized) continue;
            rateLimitTimestamp = timestamp;
            rateLimitPayload = { ...normalized, source_file: file };
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}

// Upsert rate-limit snapshot to SyncLog (provider = 'codex_rl')
if (rateLimitPayload) {
  // Keep stored snapshots readable by the currently deployed frontend, which
  // predates nullable windows. The new reader validates window_minutes and
  // ignores these placeholders after deployment.
  const storedRateLimitPayload = {
    ...rateLimitPayload,
    primary: rateLimitPayload.primary ?? {
      used_percent: 0,
      window_minutes: 0,
      resets_at: 0,
      synthetic: true,
    },
    secondary: rateLimitPayload.secondary ?? {
      used_percent: 0,
      window_minutes: 0,
      resets_at: 0,
      synthetic: true,
    },
  };
  const rlLogId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await client.query(
    `INSERT INTO "SyncLog" (id, provider, status, message)
     VALUES ($1, 'codex_rl', 'success', $2)`,
    [rlLogId, JSON.stringify(storedRateLimitPayload)]
  );
  const windows = [
    rateLimitPayload.primary ? `5h: ${rateLimitPayload.primary.used_percent}%` : null,
    rateLimitPayload.secondary ? `7d: ${rateLimitPayload.secondary.used_percent}%` : null,
  ].filter(Boolean).join(', ');
  console.log(`[${new Date().toISOString()}] Rate limits synced — ${windows}`);
}

// ── Write SyncLog entry ───────────────────────────────────────────────────────

const logId = Math.random().toString(36).slice(2) + Date.now().toString(36);
await client.query(
  `INSERT INTO "SyncLog" (id, provider, status, message)
   VALUES ($1, 'codex', 'success', $2)`,
  [logId, `Inserted ${synced} sessions, updated ${updated} existing`]
);

await client.end();

console.log(`[${new Date().toISOString()}] Done — ${synced} inserted, ${updated} updated.`);
