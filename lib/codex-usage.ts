/**
 * Codex usage reader.
 *
 * Two data sources:
 *
 * 1. ~/.codex/state_5.sqlite — session counts and token totals (spawns a child
 *    process to bypass Turbopack bundler issues with node:sqlite).
 *
 * 2. ~/.codex/sessions/**\/*.jsonl — rollout files written by the Codex TUI.
 *    Each session start emits a payload that includes real-time rate-limit data:
 *      primary   → 5-hour window  (used_percent, resets_at)
 *      secondary → 7-day window   (used_percent, resets_at)
 *    These are parsed from the most-recently-modified JSONL file.
 *
 * On Vercel (no local filesystem): falls back to a SyncLog row in Supabase that
 * the VPS cron script writes after every sync.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const DB_PATH      = path.join(os.homedir(), '.codex', 'state_5.sqlite');
const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

// Inline script executed in a fresh Node process — no bundler interference
const QUERY_SCRIPT = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readonly: true });
const now = Math.floor(Date.now() / 1000);
const todayStart = now - (now % 86400);
const weekAgo = now - 7 * 86400;
const today  = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_used),0) as tok FROM threads WHERE created_at >= ?').get(todayStart);
const week   = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(tokens_used),0) as tok FROM threads WHERE created_at >= ?').get(weekAgo);
const latest = db.prepare('SELECT model, updated_at FROM threads ORDER BY updated_at DESC LIMIT 1').get();
db.close();
process.stdout.write(JSON.stringify({ today, week, latest }));
`;

interface RateLimitWindow {
  used_percent: number;
  window_minutes: number;
  resets_at: number; // Unix timestamp (seconds)
}

interface RateLimitData {
  primary:   RateLimitWindow; // 5-hour
  secondary: RateLimitWindow; // 7-day
  plan_type: string | null;
  source_file: string;
}

export interface CodexUsageResult {
  available: boolean;
  model: string | null;
  tier: string | null;
  sessionsToday: number;
  sessionsWeek: number;
  tokensToday: number;
  tokensWeek: number;
  latestSessionAt: number | null;    // Unix timestamp (seconds)
  // Rate-limit windows from rollout JSONL or Supabase fallback
  fiveHourPct:  number | null;
  sevenDayPct:  number | null;
  resetsAt5h:   number | null;       // Unix timestamp (seconds)
  resetsAt7d:   number | null;
  checkedAt: string;
}

/**
 * Walk ~/.codex/sessions recursively and return all *.jsonl paths sorted by
 * mtime descending.
 */
function listRolloutFiles(): string[] {
  if (!existsSync(SESSIONS_DIR)) return [];
  const results: { path: string; mtime: number }[] = [];

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) {
            walk(full);
          } else if (entry.endsWith('.jsonl')) {
            results.push({ path: full, mtime: st.mtimeMs });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(SESSIONS_DIR);
  results.sort((a, b) => b.mtime - a.mtime);
  return results.map(r => r.path);
}

/**
 * Parse rate-limit data from the most recently modified rollout JSONL file.
 * The Codex TUI emits a "thread/status/changed" event at session start that
 * contains a `rate_limits` payload.
 */
function readLocalRateLimits(): RateLimitData | null {
  const files = listRolloutFiles();
  // Only look at files modified in the last 7 days
  const weekAgoMs = Date.now() - 7 * 86_400_000;

  for (const file of files) {
    try {
      const st = statSync(file);
      if (st.mtimeMs < weekAgoMs) break; // sorted by mtime desc, stop early

      const lines = readFileSync(file, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as Record<string, unknown>;
          const payload = (d.payload ?? {}) as Record<string, unknown>;
          const rl = payload.rate_limits as Record<string, unknown> | undefined;
          if (
            rl &&
            typeof rl.primary === 'object' && rl.primary !== null &&
            typeof rl.secondary === 'object' && rl.secondary !== null
          ) {
            return {
              primary:   rl.primary   as RateLimitWindow,
              secondary: rl.secondary as RateLimitWindow,
              plan_type: (rl.plan_type as string | null) ?? null,
              source_file: file,
            };
          }
        } catch { /* malformed line */ }
      }
    } catch { /* skip file */ }
  }
  return null;
}

/**
 * Fallback: read latest rate-limit snapshot from Supabase via REST API.
 * The VPS cron (codex-sync.mjs) writes a SyncLog row with
 *   provider = 'codex_rl' and message = JSON.stringify(RateLimitData)
 * Uses HTTPS so it works from Vercel (direct TCP to Postgres is blocked).
 */
async function readSupabaseRateLimits(): Promise<RateLimitData | null> {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/SyncLog?provider=eq.codex_rl&status=eq.success&order=synced_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ message: string | null }>;
    if (!rows[0]?.message) return null;
    return JSON.parse(rows[0].message) as RateLimitData;
  } catch {
    return null;
  }
}

export async function getCodexUsage(): Promise<CodexUsageResult> {
  const checkedAt = new Date().toISOString();
  const unavailable: CodexUsageResult = {
    available: false,
    model: null,
    tier: null,
    sessionsToday: 0,
    sessionsWeek: 0,
    tokensToday: 0,
    tokensWeek: 0,
    latestSessionAt: null,
    fiveHourPct: null,
    sevenDayPct: null,
    resetsAt5h: null,
    resetsAt7d: null,
    checkedAt,
  };

  // ── Rate limits (JSONL or Supabase fallback) ──────────────────────────────
  const localRL = readLocalRateLimits();
  const rl: RateLimitData | null = localRL ?? await readSupabaseRateLimits();

  // ── Session counts + tokens from SQLite ──────────────────────────────────
  if (!existsSync(DB_PATH)) {
    // Vercel / no SQLite — return what we have from Supabase
    if (!rl) return unavailable;
    return {
      ...unavailable,
      available: true,
      tier: rl.plan_type ?? 'Plus',
      fiveHourPct:  rl.primary.used_percent,
      sevenDayPct:  rl.secondary.used_percent,
      resetsAt5h:   rl.primary.resets_at,
      resetsAt7d:   rl.secondary.resets_at,
      checkedAt,
    };
  }

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['-e', QUERY_SCRIPT, DB_PATH],
      { timeout: 5_000 }
    );

    const data = JSON.parse(stdout) as {
      today:  { cnt: number; tok: number };
      week:   { cnt: number; tok: number };
      latest?: { model: string | null; updated_at: number };
    };

    return {
      available: true,
      model:           data.latest?.model ?? null,
      tier:            rl?.plan_type ?? 'Plus',
      sessionsToday:   data.today.cnt ?? 0,
      sessionsWeek:    data.week.cnt  ?? 0,
      tokensToday:     data.today.tok ?? 0,
      tokensWeek:      data.week.tok  ?? 0,
      latestSessionAt: data.latest?.updated_at ?? null,
      fiveHourPct:     rl?.primary.used_percent   ?? null,
      sevenDayPct:     rl?.secondary.used_percent ?? null,
      resetsAt5h:      rl?.primary.resets_at      ?? null,
      resetsAt7d:      rl?.secondary.resets_at    ?? null,
      checkedAt,
    };
  } catch {
    return unavailable;
  }
}
