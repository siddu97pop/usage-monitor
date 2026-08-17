#!/usr/bin/env node

import { createRequire } from 'module';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const ENV_PATH = path.join(import.meta.dirname, '..', '.env.local');
const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_DIR = path.join(os.homedir(), '.codex', 'sessions');
const DAYS_TO_SYNC = Number(process.env.ANALYTICS_SYNC_DAYS ?? 90);

if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
}

if (!process.env.DIRECT_URL) {
  console.error('DIRECT_URL not set.');
  process.exit(1);
}

function listJsonl(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stats = statSync(full);
        if (stats.isDirectory()) walk(full);
        else if (entry.endsWith('.jsonl')) files.push(full);
      } catch { /* file disappeared during traversal */ }
    }
  };
  walk(root);
  return files;
}

function readJsonl(file) {
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* partial final line */ }
  }
  return rows;
}

function projectLabel(cwd) {
  if (!cwd || typeof cwd !== 'string') return 'Unknown';
  const normalized = cwd.replaceAll('\\', '/');
  const projectMatch = normalized.match(/\/projects\/([^/]+)/i);
  return projectMatch?.[1] ?? path.basename(normalized) ?? 'Unknown';
}

// Agent subthread files (`agent-*.jsonl`, walked from `subagents/` directories)
// carry the *parent* session's `sessionId` on every row, not a unique one — so
// parsing them as standalone sessions with that raw id would collide with the
// parent conversation's upsert key. Distinguish by filename.
function isAgentFile(file) {
  return path.basename(file).startsWith('agent-');
}

function parseClaude(file) {
  const rows = readJsonl(file);
  const allAssistantRows = rows.filter((row) => row.type === 'assistant' && row.message?.usage);
  if (!allAssistantRows.length) return null;

  // Sidechain rows (Task-spawned subagent turns) can appear inline in a main
  // conversation file, not only in separate agent-*.jsonl files. Keep them out
  // of the main-thread totals and report them separately.
  const assistantRows = allAssistantRows.filter((row) => row.isSidechain !== true);
  const sidechainRows = allAssistantRows.filter((row) => row.isSidechain === true);
  const mainRows = assistantRows.length ? assistantRows : allAssistantRows;

  const first = mainRows[0];
  const last = mainRows.at(-1);
  const usage = mainRows.reduce((total, row) => {
    const current = row.message.usage ?? {};
    total.input += Number(current.input_tokens ?? 0);
    total.output += Number(current.output_tokens ?? 0);
    total.cacheRead += Number(current.cache_read_input_tokens ?? 0);
    total.cacheWrite += Number(current.cache_creation_input_tokens ?? 0);
    total.cacheWrite5m += Number(current.cache_creation?.ephemeral_5m_input_tokens ?? 0);
    total.cacheWrite1h += Number(current.cache_creation?.ephemeral_1h_input_tokens ?? 0);
    total.thinking += Number(current.output_tokens_details?.thinking_tokens ?? 0);
    total.webSearches += Number(current.server_tool_use?.web_search_requests ?? 0);
    total.webFetches += Number(current.server_tool_use?.web_fetch_requests ?? 0);
    return total;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0, thinking: 0, webSearches: 0, webFetches: 0 });

  const sidechainTokens = sidechainRows.reduce((sum, row) => {
    const current = row.message.usage ?? {};
    return sum + Number(current.input_tokens ?? 0) + Number(current.output_tokens ?? 0)
      + Number(current.cache_read_input_tokens ?? 0) + Number(current.cache_creation_input_tokens ?? 0);
  }, 0);

  const toolBreakdown = {};
  let toolCalls = 0;
  for (const row of rows) {
    if (row.type !== 'assistant') continue;
    for (const item of row.message?.content ?? []) {
      if (item.type !== 'tool_use') continue;
      toolCalls++;
      const name = item.name ?? 'unknown';
      toolBreakdown[name] = (toolBreakdown[name] ?? 0) + 1;
    }
  }

  const stopReasons = {};
  const serviceTiers = {};
  const speeds = {};
  for (const row of mainRows) {
    const stopReason = row.message?.stop_reason;
    if (stopReason) stopReasons[stopReason] = (stopReasons[stopReason] ?? 0) + 1;
    const serviceTier = row.message?.usage?.service_tier;
    if (serviceTier) serviceTiers[serviceTier] = (serviceTiers[serviceTier] ?? 0) + 1;
    const speed = row.message?.usage?.speed;
    if (speed) speeds[speed] = (speeds[speed] ?? 0) + 1;
  }

  const startedAt = Date.parse(first.timestamp ?? rows[0]?.timestamp ?? '');
  const endedAt = Date.parse(last.timestamp ?? '');
  const models = [...new Set(mainRows.map((row) => row.message?.model).filter(Boolean))];
  const parentSessionId = first.sessionId ?? first.session_id ?? path.basename(file, '.jsonl');
  const isAgentSession = isAgentFile(file);
  // Keep the sessionId (and therefore the `analytics-v2:claude:<sessionId>`
  // upsert key) distinct from the parent conversation's when this file is a
  // subagent thread, so the two never collide and overwrite each other.
  const sessionId = isAgentSession && first.agentId ? `${parentSessionId}:agent:${first.agentId}` : parentSessionId;
  const cwd = first.cwd ?? rows.find((row) => row.cwd)?.cwd;

  return {
    provider: 'claude',
    sessionId,
    timestamp: Number.isFinite(startedAt) ? new Date(startedAt) : statSync(file).birthtime,
    model: models.at(-1) ?? 'unknown',
    totalTokens: usage.input + usage.output + usage.cacheRead + usage.cacheWrite,
    payload: {
      analytics_version: 3,
      input_tokens: usage.input,
      output_tokens: usage.output,
      cached_input_tokens: usage.cacheRead,
      cache_creation_tokens: usage.cacheWrite,
      cache_creation_5m_tokens: usage.cacheWrite5m,
      cache_creation_1h_tokens: usage.cacheWrite1h,
      // Thinking tokens are already counted inside output_tokens above —
      // this is an informational subset, not an addition to the total.
      reasoning_tokens: usage.thinking,
      thinking_tokens: usage.thinking,
      duration_ms: Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : null,
      time_to_first_token_ms: null,
      context_window: null,
      peak_context_tokens: null,
      compactions: rows.filter((row) => row.type === 'system' && row.subtype === 'compact_boundary').length,
      tool_calls: toolCalls,
      tool_breakdown: toolBreakdown,
      sidechain_messages: sidechainRows.length,
      sidechain_tokens: sidechainTokens,
      is_agent_session: isAgentSession,
      stop_reasons: stopReasons,
      service_tiers: serviceTiers,
      speeds: speeds,
      effort: last.effort ?? null,
      entrypoint: last.entrypoint ?? null,
      cc_version: last.version ?? null,
      git_branch: last.gitBranch ?? null,
      web_searches: usage.webSearches,
      web_fetches: usage.webFetches,
      project: projectLabel(cwd),
      models,
      source: 'claude-jsonl',
    },
  };
}

function parseCodex(file) {
  const rows = readJsonl(file);
  const tokenRows = rows.filter((row) => row.type === 'event_msg' && row.payload?.type === 'token_count' && row.payload?.info?.total_token_usage);
  if (!tokenRows.length) return null;

  const lastToken = tokenRows.at(-1).payload.info;
  const usage = lastToken.total_token_usage;
  const sessionMeta = rows.find((row) => row.type === 'session_meta')?.payload ?? {};
  const contexts = rows.filter((row) => row.type === 'turn_context');
  const latestContext = contexts.at(-1)?.payload ?? {};
  const taskCompletions = rows.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete');
  const sessionId = sessionMeta.id ?? path.basename(file, '.jsonl');
  const timestamp = Date.parse(sessionMeta.timestamp ?? rows[0]?.timestamp ?? '');
  const contextWindow = Number(lastToken.model_context_window ?? latestContext.model_context_window ?? 0) || null;
  // `total_token_usage` is cumulative for the whole thread; `last_token_usage`
  // represents the current request and is the appropriate context-window proxy.
  const peakContext = tokenRows.reduce((peak, row) => Math.max(peak, Number(row.payload.info?.last_token_usage?.total_tokens ?? 0)), 0);
  const peakInput = tokenRows.reduce((peak, row) => Math.max(peak, Number(row.payload.info?.last_token_usage?.input_tokens ?? 0)), 0);

  return {
    provider: 'codex',
    sessionId,
    timestamp: Number.isFinite(timestamp) ? new Date(timestamp) : statSync(file).birthtime,
    model: latestContext.model ?? sessionMeta.model ?? 'unknown',
    totalTokens: Number(usage.total_tokens ?? 0),
    payload: {
      analytics_version: 2,
      input_tokens: Number(usage.input_tokens ?? 0),
      output_tokens: Number(usage.output_tokens ?? 0),
      cached_input_tokens: Number(usage.cached_input_tokens ?? 0),
      cache_creation_tokens: 0,
      reasoning_tokens: Number(usage.reasoning_output_tokens ?? 0),
      duration_ms: taskCompletions.reduce((sum, row) => sum + Number(row.payload.duration_ms ?? 0), 0) || null,
      time_to_first_token_ms: taskCompletions.length
        ? Math.round(taskCompletions.reduce((sum, row) => sum + Number(row.payload.time_to_first_token_ms ?? 0), 0) / taskCompletions.length)
        : null,
      context_window: contextWindow,
      peak_context_tokens: peakContext || null,
      peak_input_tokens: peakInput || null,
      compactions: rows.filter((row) => row.type === 'compacted' || row.payload?.type === 'context_compacted').length,
      tool_calls: rows.filter((row) => row.type === 'response_item' && row.payload?.type === 'function_call').length,
      web_searches: rows.filter((row) => row.payload?.type === 'web_search_end').length,
      web_fetches: 0,
      project: projectLabel(sessionMeta.cwd ?? latestContext.cwd),
      models: [...new Set(contexts.map((row) => row.payload?.model).filter(Boolean))],
      reasoning_effort: latestContext.effort ?? null,
      source: 'codex-rollout',
    },
  };
}

const cutoff = Date.now() - DAYS_TO_SYNC * 86_400_000;
const parsed = [];
for (const [root, parser] of [[CLAUDE_DIR, parseClaude], [CODEX_DIR, parseCodex]]) {
  for (const file of listJsonl(root)) {
    try {
      if (statSync(file).mtimeMs < cutoff) continue;
      const session = parser(file);
      if (session && session.timestamp.getTime() >= cutoff) parsed.push(session);
    } catch (error) {
      console.warn(`Skipped ${path.basename(file)}: ${error.message}`);
    }
  }
}

const { default: pg } = await import('pg').catch(() => {
  console.error('Missing dependency: npm install pg');
  process.exit(1);
});
const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
await client.connect();

let synced = 0;
for (const session of parsed) {
  const notes = session.provider === 'codex'
    ? `codex-${session.sessionId}`
    : `analytics-v2:claude:${session.sessionId}`;
  const existing = await client.query(
    `SELECT id FROM "UsageRecord" WHERE provider = $1 AND notes = $2 LIMIT 1`,
    [session.provider, notes],
  );
  const payload = JSON.stringify(session.payload);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE "UsageRecord"
       SET timestamp = $1, usage_value = 1, usage_unit = 'sessions', tokens = $2,
           model_name = $3, raw_payload = $4::jsonb, sync_status = 'synced', updated_at = NOW()
       WHERE id = $5`,
      [session.timestamp.toISOString(), session.totalTokens, session.model, payload, existing.rows[0].id],
    );
  } else {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await client.query(
      `INSERT INTO "UsageRecord"
       (id, provider, source_type, timestamp, usage_value, usage_unit, tokens,
        model_name, raw_payload, sync_status, notes, updated_at)
       VALUES ($1, $2, 'subscription', $3, 1, 'sessions', $4, $5, $6::jsonb, 'synced', $7, NOW())`,
      [id, session.provider, session.timestamp.toISOString(), session.totalTokens, session.model, payload, notes],
    );
  }
  synced++;
}

const logId = Math.random().toString(36).slice(2) + Date.now().toString(36);
await client.query(
  `INSERT INTO "SyncLog" (id, provider, status, message)
   VALUES ($1, 'analytics_v2', 'success', $2)`,
  [logId, `Upserted ${synced} Claude/Codex sessions (${DAYS_TO_SYNC} day window)`],
);
await client.end();
console.log(`[${new Date().toISOString()}] Analytics V2 synced ${synced} sessions.`);

export { parseClaude, parseCodex, projectLabel };
