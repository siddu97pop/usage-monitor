/**
 * Claude usage reader.
 *
 * Primary source: /tmp/claude/statusline-usage-cache-*.json
 *   Written by statusline-command.sh (refreshed every 60s during Claude sessions)
 *   from https://api.anthropic.com/api/oauth/usage
 *   Fields: five_hour.utilization (0–100), five_hour.resets_at (ISO)
 *            seven_day.utilization (0–100), seven_day.resets_at (ISO)
 *
 * Fallback: reads the OAuth token from ~/.claude/.credentials.json
 *   and hits the API directly if the cache is stale (> 5 min) or missing.
 */

import fs from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import os from 'os';

const TMP_CACHE_DIR = '/tmp/claude';
const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');
const USAGE_API = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_STALE_MS = 5 * 60 * 1000; // 5 minutes

export interface ClaudeUsageResult {
  available: boolean;
  fiveHourPct: number | null;
  sevenDayPct: number | null;
  resetsAt5h: number | null;  // Unix timestamp seconds
  resetsAt7d: number | null;  // Unix timestamp seconds
  checkedAt: string;
}

function isoToUnix(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return isNaN(ts) ? null : Math.floor(ts / 1000);
}

function parseUsageJson(data: Record<string, unknown>): Omit<ClaudeUsageResult, 'available' | 'checkedAt'> | null {
  type Block = { utilization?: number; resets_at?: string };
  const fh = data.five_hour as Block | undefined;
  const sd = data.seven_day as Block | undefined;

  const fiveHourPct = fh?.utilization ?? null;
  const sevenDayPct = sd?.utilization ?? null;

  if (fiveHourPct === null && sevenDayPct === null) return null;

  return {
    fiveHourPct,
    sevenDayPct,
    resetsAt5h: isoToUnix(fh?.resets_at),
    resetsAt7d: isoToUnix(sd?.resets_at),
  };
}

// ── Read from /tmp/claude/statusline-usage-cache-*.json ──────────────────────

async function readFromCache(): Promise<Omit<ClaudeUsageResult, 'available' | 'checkedAt'> | null> {
  try {
    if (!existsSync(TMP_CACHE_DIR)) return null;

    const files = readdirSync(TMP_CACHE_DIR)
      .filter((f) => f.startsWith('statusline-usage-cache-') && f.endsWith('.json'))
      .map((f) => {
        const full = path.join(TMP_CACHE_DIR, f);
        return { full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    if (files.length === 0) return null;

    const newest = files[0];
    if (Date.now() - newest.mtime > CACHE_STALE_MS) return null; // stale

    const raw = await fs.readFile(newest.full, 'utf-8');
    return parseUsageJson(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Fetch from API using OAuth token ─────────────────────────────────────────

async function getOAuthToken(): Promise<string | null> {
  // 1. Env var — works on Vercel (set CLAUDE_OAUTH_TOKEN in dashboard)
  if (process.env.CLAUDE_OAUTH_TOKEN) return process.env.CLAUDE_OAUTH_TOKEN;
  // 2. Local credentials file — works on VPS
  try {
    const creds = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8')) as Record<string, unknown>;
    type OAuthBlock = { accessToken?: string };
    return (creds.claudeAiOauth as OAuthBlock | undefined)?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function fetchFromApi(): Promise<Omit<ClaudeUsageResult, 'available' | 'checkedAt'> | null> {
  try {
    const token = await getOAuthToken();
    if (!token) return null;

    const res = await fetch(USAGE_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1.34',
      },
    });

    if (!res.ok) return null;
    return parseUsageJson((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getClaudeUsage(): Promise<ClaudeUsageResult> {
  const checkedAt = new Date().toISOString();
  const unavailable: ClaudeUsageResult = {
    available: false,
    fiveHourPct: null,
    sevenDayPct: null,
    resetsAt5h: null,
    resetsAt7d: null,
    checkedAt,
  };

  const result = (await readFromCache()) ?? (await fetchFromApi());
  if (!result) return unavailable;

  // If the reset timestamp has already passed, the stale percentage is
  // meaningless — zero it out so we don't show 100% on a fresh window.
  const nowSecs = Math.floor(Date.now() / 1000);
  const effective5hPct = result.resetsAt5h !== null && result.resetsAt5h <= nowSecs
    ? 0
    : result.fiveHourPct;
  const effective7dPct = result.resetsAt7d !== null && result.resetsAt7d <= nowSecs
    ? 0
    : result.sevenDayPct;

  return {
    available: true,
    checkedAt,
    ...result,
    fiveHourPct: effective5hPct,
    sevenDayPct: effective7dPct,
  };
}

/** Formats a Unix timestamp as "Resets in Xh YYm" / "Resets in Xd Yh" (or "Resetting now"). */
export function formatResetTime(unixTs: number | null): string {
  if (!unixTs) return 'Reset time unknown';
  const secsLeft = unixTs - Math.floor(Date.now() / 1000);
  if (secsLeft <= 0) return 'Resetting now';
  const days = Math.floor(secsLeft / 86400);
  const hrs  = Math.floor((secsLeft % 86400) / 3600);
  const mins = Math.floor((secsLeft % 3600) / 60);
  if (days > 0) return `Resets in ${days}d ${hrs}h`;
  if (hrs > 0)  return `Resets in ${hrs}h ${String(mins).padStart(2, '0')}m`;
  return `Resets in ${mins}m`;
}
