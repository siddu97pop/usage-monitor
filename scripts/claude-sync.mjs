#!/usr/bin/env node
/**
 * claude-sync.mjs — Reads Claude usage from Anthropic's OAuth API and writes
 * a snapshot to Supabase SyncLog (provider = 'claude_rl').
 *
 * The VPS always has fresh credentials because Claude Code auto-refreshes them.
 * Vercel can't do this, so it reads the snapshot from Supabase instead.
 *
 * Run via cron: every 5 min
 *   node /path/to/scripts/claude-sync.mjs >> /tmp/claude-sync.log 2>&1
 *
 * Env vars (from .env.local or exported):
 *   SUPABASE_URL      — https://xxx.supabase.co
 *   SUPABASE_ANON_KEY — eyJ...
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');
const USAGE_API        = 'https://api.anthropic.com/api/oauth/usage';
const ENV_PATH         = path.join(import.meta.dirname, '..', '.env.local');

// ── Load .env.local ───────────────────────────────────────────────────────────

if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL      = process.env.SUPABASE_URL;
// Writes require a key that bypasses RLS; anon is read-only on SyncLog.
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY not set.');
  process.exit(1);
}

// ── Read OAuth token from credentials file ────────────────────────────────────

if (!existsSync(CREDENTIALS_PATH)) {
  console.log(`[${new Date().toISOString()}] No credentials file — skipping.`);
  process.exit(0);
}

let accessToken;
try {
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
  accessToken = creds?.claudeAiOauth?.accessToken;
  if (!accessToken) throw new Error('accessToken missing');

  // Warn if token is within 10 minutes of expiry (Claude Code should refresh it)
  const expiresAt = creds?.claudeAiOauth?.expiresAt;
  if (expiresAt) {
    const secsLeft = Math.floor(expiresAt / 1000) - Math.floor(Date.now() / 1000);
    if (secsLeft < 600) {
      console.warn(`[${new Date().toISOString()}] Token expires in ${secsLeft}s — may need Claude Code to refresh.`);
    }
  }
} catch (e) {
  console.error(`[${new Date().toISOString()}] Failed to read credentials: ${e.message}`);
  process.exit(1);
}

// ── Call Anthropic usage API ─────────────────────────────────────────────────

let usageData;
try {
  const res = await fetch(USAGE_API, {
    headers: {
      Authorization:       `Bearer ${accessToken}`,
      'Content-Type':      'application/json',
      Accept:              'application/json',
      'anthropic-beta':    'oauth-2025-04-20',
      'User-Agent':        'claude-code/2.1.34',
    },
  });

  if (!res.ok) {
    console.error(`[${new Date().toISOString()}] API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  usageData = await res.json();
} catch (e) {
  console.error(`[${new Date().toISOString()}] Fetch failed: ${e.message}`);
  process.exit(1);
}

const fh = usageData?.five_hour;
const sd = usageData?.seven_day;
if (!fh && !sd) {
  console.error(`[${new Date().toISOString()}] Unexpected API response shape.`);
  process.exit(1);
}

// ── Write snapshot to Supabase SyncLog via REST API ──────────────────────────

const logId = Math.random().toString(36).slice(2) + Date.now().toString(36);

const res = await fetch(`${SUPABASE_URL}/rest/v1/SyncLog`, {
  method: 'POST',
  headers: {
    apikey:          SUPABASE_ANON_KEY,
    Authorization:   `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    Prefer:          'return=minimal',
  },
  body: JSON.stringify({
    id:       logId,
    provider: 'claude_rl',
    status:   'success',
    message:  JSON.stringify(usageData),
  }),
});

if (!res.ok) {
  console.error(`[${new Date().toISOString()}] Supabase write failed ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log(
  `[${new Date().toISOString()}] Claude usage synced — ` +
  `5h: ${fh?.utilization ?? '?'}%, 7d: ${sd?.utilization ?? '?'}%`
);
