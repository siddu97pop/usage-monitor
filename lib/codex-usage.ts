/**
 * Codex usage reader.
 *
 * Queries ~/.codex/state_5.sqlite (written by the Codex CLI after every
 * session) by spawning a small inline Node.js script. This approach bypasses
 * any bundler (webpack/Turbopack) issues with the experimental node:sqlite
 * built-in.
 *
 * Data returned:
 *   - sessionsToday / sessionsWeek — count of threads created today / this week
 *   - tokensToday / tokensWeek    — sum of tokens_used today / this week
 *   - model                       — model from the most recent thread
 *   - latestSessionAt             — updated_at of the most recent thread (Unix s)
 *
 * Rate-limit percentages (session %, weekly %) are NOT available without a
 * browser session cookie — OpenAI only exposes them at
 * chatgpt.com/codex/settings/usage. We surface real session/token counts
 * instead.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const DB_PATH = path.join(os.homedir(), '.codex', 'state_5.sqlite');

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

export interface CodexUsageResult {
  available: boolean;
  model: string | null;
  tier: string | null;
  sessionsToday: number;
  sessionsWeek: number;
  tokensToday: number;
  tokensWeek: number;
  latestSessionAt: number | null; // Unix timestamp (seconds)
  checkedAt: string;
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
    checkedAt,
  };

  try {
    const { stdout } = await execFileAsync(
      process.execPath, // same node binary running Next.js
      ['-e', QUERY_SCRIPT, DB_PATH],
      { timeout: 5_000 }
    );

    const data = JSON.parse(stdout) as {
      today: { cnt: number; tok: number };
      week:  { cnt: number; tok: number };
      latest?: { model: string | null; updated_at: number };
    };

    return {
      available: true,
      model: data.latest?.model ?? null,
      tier: 'Plus',
      sessionsToday: data.today.cnt ?? 0,
      sessionsWeek:  data.week.cnt  ?? 0,
      tokensToday:   data.today.tok ?? 0,
      tokensWeek:    data.week.tok  ?? 0,
      latestSessionAt: data.latest?.updated_at ?? null,
      checkedAt,
    };
  } catch {
    return unavailable;
  }
}
