import { NextRequest, NextResponse } from 'next/server';
import { calculateEstimates, type AnalyticsPayload, type AnalyticsProvider, type AnalyticsResponse, type AnalyticsSession } from '@/lib/analytics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

interface UsageRow {
  id: string;
  provider: AnalyticsProvider;
  timestamp: string;
  tokens: number | null;
  model_name: string | null;
  raw_payload: AnalyticsPayload | null;
}

function dubaiParts(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    hour: Number(get('hour')),
  };
}

function nullableAverage(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

const PAGE_SIZE = 1000;
// Safety ceiling so a runaway range can't page forever; well above any
// realistic 90-day window.
const MAX_ROWS = 50_000;

// PostgREST truncates at its own row cap regardless of `limit`; page through
// with `Range` headers until the server reports no more rows remain.
async function fetchAllRows(usageUrl: string, headers: Record<string, string>): Promise<UsageRow[]> {
  const rows: UsageRow[] = [];
  let offset = 0;
  while (offset < MAX_ROWS) {
    const res = await fetch(usageUrl, {
      headers: { ...headers, Range: `${offset}-${offset + PAGE_SIZE - 1}`, Prefer: 'count=exact' },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 206) throw new Error(`Usage query failed: ${res.status}`);
    const page = await res.json() as UsageRow[];
    rows.push(...page);
    const contentRange = res.headers.get('content-range');
    const total = contentRange?.split('/')[1];
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
    if (total && total !== '*' && offset >= Number(total)) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const requestedDays = Number(request.nextUrl.searchParams.get('days') ?? 30);
  const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const rawProvider = request.nextUrl.searchParams.get('provider');
  const provider: AnalyticsProvider | 'all' = rawProvider === 'claude' || rawProvider === 'codex' ? rawProvider : 'all';
  const empty: AnalyticsResponse = {
    summary: { totalTokens: 0, sessions: 0, activeDays: 0, averageTokensPerSession: 0, apiEquivalentCost: null, codexCredits: null, cacheHitRatio: null, outputInputRatio: null, averageContextUtilization: null, compactions: 0, averageDurationMs: null, averageTimeToFirstTokenMs: null },
    daily: [], providers: [], models: [], projects: [], heatmap: [], sessions: [],
    toolMix: [], threadSplit: { mainTokens: 0, subagentTokens: 0 }, entrypoints: [], effortLevels: [],
    stopReasons: [], speeds: [], ccVersions: [], cacheWriteSplit: { fiveMinute: 0, oneHour: 0 },
    range: { days, provider, timezone: 'Asia/Dubai' }, dataQuality: { v3Sessions: 0, v2Sessions: 0, legacySessions: 0, measuredSessions: 0, partialSessions: 0, apiEquivalentSessions: 0, codexCreditSessions: 0, lastSync: null }, refreshedAt: new Date().toISOString(),
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.json(empty);

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const providerFilter = provider === 'all' ? 'provider=in.(claude,codex)' : `provider=eq.${provider}`;
  const usageUrl = `${SUPABASE_URL}/rest/v1/UsageRecord?select=id,provider,timestamp,tokens,model_name,raw_payload&${providerFilter}&timestamp=gte.${encodeURIComponent(since)}&source_type=neq.rate_limit&order=timestamp.desc`;
  const syncUrl = `${SUPABASE_URL}/rest/v1/SyncLog?select=synced_at&provider=eq.analytics_v2&status=eq.success&order=synced_at.desc&limit=1`;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  try {
    const [rows, syncRes] = await Promise.all([
      fetchAllRows(usageUrl, headers),
      fetch(syncUrl, { headers, cache: 'no-store' }),
    ]);
    const syncRows = syncRes.ok ? await syncRes.json() as Array<{ synced_at: string }> : [];

    const sessions: AnalyticsSession[] = rows.map((row) => {
      const payload = row.raw_payload ?? {};
      const rawInputTokens = Number(payload.input_tokens ?? 0);
      const outputTokens = Number(payload.output_tokens ?? 0);
      const cachedTokens = Number(payload.cached_input_tokens ?? 0);
      const cacheCreationTokens = Number(payload.cache_creation_tokens ?? 0);
      const reasoningTokens = Number(payload.reasoning_tokens ?? 0);
      // Codex reports cached input as part of input_tokens; Claude reports it
      // separately. Normalize both providers to uncached input for analytics.
      const inputTokens = row.provider === 'codex' ? Math.max(0, rawInputTokens - cachedTokens) : rawInputTokens;
      const totalTokens = Number(row.tokens ?? inputTokens + outputTokens + cachedTokens + cacheCreationTokens);
      const estimates = calculateEstimates(row.provider, row.model_name ?? 'unknown', payload);
      const contextWindow = Number(payload.context_window ?? 0);
      const peakContext = Number(payload.peak_context_tokens ?? 0);
      return {
        id: row.id,
        provider: row.provider,
        timestamp: row.timestamp,
        model: row.model_name ?? 'Unknown',
        project: payload.project ?? 'Unknown',
        totalTokens, inputTokens, outputTokens, cachedTokens, cacheCreationTokens, reasoningTokens,
        durationMs: payload.duration_ms ?? null,
        timeToFirstTokenMs: payload.time_to_first_token_ms ?? null,
        contextUtilization: contextWindow > 0 && peakContext > 0 ? Math.min(1, peakContext / contextWindow) : null,
        compactions: Number(payload.compactions ?? 0),
        toolCalls: Number(payload.tool_calls ?? 0),
        analyticsVersion: Number(payload.analytics_version ?? 2),
        thinkingTokens: Number(payload.thinking_tokens ?? 0),
        cacheCreation5mTokens: Number(payload.cache_creation_5m_tokens ?? 0),
        cacheCreation1hTokens: Number(payload.cache_creation_1h_tokens ?? 0),
        toolBreakdown: payload.tool_breakdown ?? {},
        sidechainMessages: Number(payload.sidechain_messages ?? 0),
        sidechainTokens: Number(payload.sidechain_tokens ?? 0),
        isAgentSession: Boolean(payload.is_agent_session ?? false),
        stopReasons: payload.stop_reasons ?? {},
        serviceTiers: payload.service_tiers ?? {},
        speeds: payload.speeds ?? {},
        effort: payload.effort ?? null,
        entrypoint: payload.entrypoint ?? null,
        ccVersion: payload.cc_version ?? null,
        gitBranch: payload.git_branch ?? null,
        ...estimates,
      };
    });

    const dailyMap = new Map<string, AnalyticsResponse['daily'][number]>();
    const providerMap = new Map<string, AnalyticsResponse['providers'][number]>();
    const modelMap = new Map<string, AnalyticsResponse['models'][number]>();
    const projectMap = new Map<string, AnalyticsResponse['projects'][number]>();
    const heatmapMap = new Map<string, AnalyticsResponse['heatmap'][number]>();
    const toolMixMap = new Map<string, number>();
    const entrypointMap = new Map<string, number>();
    const effortMap = new Map<string, number>();
    const stopReasonMap = new Map<string, number>();
    const speedMap = new Map<string, number>();
    const ccVersionMap = new Map<string, number>();
    let mainTokens = 0, subagentTokens = 0, cacheWrite5m = 0, cacheWrite1h = 0;
    for (const session of sessions) {
      const local = dubaiParts(session.timestamp);
      const daily = dailyMap.get(local.date) ?? { date: local.date, input: 0, output: 0, cached: 0, reasoning: 0, sessions: 0 };
      daily.input += session.inputTokens; daily.output += session.outputTokens; daily.cached += session.cachedTokens + session.cacheCreationTokens; daily.reasoning += session.reasoningTokens; daily.sessions++;
      dailyMap.set(local.date, daily);
      const providerItem = providerMap.get(session.provider) ?? { name: session.provider, tokens: 0, sessions: 0 };
      providerItem.tokens += session.totalTokens; providerItem.sessions++; providerMap.set(session.provider, providerItem);
      const modelKey = `${session.provider}:${session.model}`;
      const modelItem = modelMap.get(modelKey) ?? { name: session.model, provider: session.provider, tokens: 0, sessions: 0 };
      modelItem.tokens += session.totalTokens; modelItem.sessions++; modelMap.set(modelKey, modelItem);
      const projectItem = projectMap.get(session.project) ?? { name: session.project, tokens: 0, sessions: 0 };
      projectItem.tokens += session.totalTokens; projectItem.sessions++; projectMap.set(session.project, projectItem);
      const heatKey = `${local.day}:${local.hour}`;
      const heat = heatmapMap.get(heatKey) ?? { day: local.day, hour: local.hour, sessions: 0, tokens: 0 };
      heat.sessions++; heat.tokens += session.totalTokens; heatmapMap.set(heatKey, heat);
      for (const [name, count] of Object.entries(session.toolBreakdown)) toolMixMap.set(name, (toolMixMap.get(name) ?? 0) + count);
      if (session.entrypoint) entrypointMap.set(session.entrypoint, (entrypointMap.get(session.entrypoint) ?? 0) + 1);
      if (session.effort) effortMap.set(session.effort, (effortMap.get(session.effort) ?? 0) + 1);
      for (const [name, count] of Object.entries(session.stopReasons)) stopReasonMap.set(name, (stopReasonMap.get(name) ?? 0) + count);
      for (const [name, count] of Object.entries(session.speeds)) speedMap.set(name, (speedMap.get(name) ?? 0) + count);
      if (session.ccVersion) ccVersionMap.set(session.ccVersion, (ccVersionMap.get(session.ccVersion) ?? 0) + 1);
      // Agent-subthread rows (isAgentSession) are entirely subagent spend;
      // for ordinary sessions, totalTokens already excludes inline sidechain
      // turns, which are tracked separately via sidechainTokens.
      if (session.isAgentSession) subagentTokens += session.totalTokens;
      else { mainTokens += session.totalTokens; subagentTokens += session.sidechainTokens; }
      cacheWrite5m += session.cacheCreation5mTokens;
      cacheWrite1h += session.cacheCreation1hTokens;
    }

    const totalTokens = sessions.reduce((sum, session) => sum + session.totalTokens, 0);
    const input = sessions.reduce((sum, session) => sum + session.inputTokens + session.cacheCreationTokens, 0);
    const cached = sessions.reduce((sum, session) => sum + session.cachedTokens, 0);
    const output = sessions.reduce((sum, session) => sum + session.outputTokens, 0);
    const usdValues = sessions.map((session) => session.apiEquivalentCost).filter((value): value is number => value !== null);
    const creditValues = sessions.map((session) => session.codexCredits).filter((value): value is number => value !== null);
    let v3Sessions = 0, v2Sessions = 0, legacySessions = 0;
    for (const session of sessions) {
      if (session.analyticsVersion === 3) v3Sessions++;
      else if (session.analyticsVersion === 2) v2Sessions++;
      else legacySessions++;
    }

    return NextResponse.json({
      summary: {
        totalTokens,
        sessions: sessions.length,
        activeDays: dailyMap.size,
        averageTokensPerSession: sessions.length ? Math.round(totalTokens / sessions.length) : 0,
        apiEquivalentCost: usdValues.length ? usdValues.reduce((sum, value) => sum + value, 0) : null,
        codexCredits: creditValues.length ? creditValues.reduce((sum, value) => sum + value, 0) : null,
        cacheHitRatio: input + cached > 0 ? cached / (input + cached) : null,
        outputInputRatio: input + cached > 0 ? output / (input + cached) : null,
        averageContextUtilization: nullableAverage(sessions.map((session) => session.contextUtilization)),
        compactions: sessions.reduce((sum, session) => sum + session.compactions, 0),
        averageDurationMs: nullableAverage(sessions.map((session) => session.durationMs)),
        averageTimeToFirstTokenMs: nullableAverage(sessions.map((session) => session.timeToFirstTokenMs)),
      },
      daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      providers: [...providerMap.values()].sort((a, b) => b.tokens - a.tokens),
      models: [...modelMap.values()].sort((a, b) => b.tokens - a.tokens),
      projects: [...projectMap.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10),
      heatmap: [...heatmapMap.values()],
      sessions: sessions.slice(0, 500),
      toolMix: [...toolMixMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      threadSplit: { mainTokens, subagentTokens },
      entrypoints: [...entrypointMap.entries()].map(([name, sessionCount]) => ({ name, sessions: sessionCount })).sort((a, b) => b.sessions - a.sessions),
      effortLevels: [...effortMap.entries()].map(([name, sessionCount]) => ({ name, sessions: sessionCount })).sort((a, b) => b.sessions - a.sessions),
      stopReasons: [...stopReasonMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      speeds: [...speedMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      ccVersions: [...ccVersionMap.entries()].map(([name, sessionCount]) => ({ name, sessions: sessionCount })).sort((a, b) => b.sessions - a.sessions),
      cacheWriteSplit: { fiveMinute: cacheWrite5m, oneHour: cacheWrite1h },
      range: { days, provider, timezone: 'Asia/Dubai' },
      dataQuality: {
        v3Sessions: v3Sessions,
        v2Sessions: v2Sessions,
        legacySessions: legacySessions,
        measuredSessions: v3Sessions + v2Sessions,
        partialSessions: legacySessions,
        apiEquivalentSessions: usdValues.length,
        codexCreditSessions: creditValues.length,
        lastSync: syncRows[0]?.synced_at ?? null,
      },
      refreshedAt: new Date().toISOString(),
    } satisfies AnalyticsResponse);
  } catch (error) {
    return NextResponse.json({ ...empty, error: error instanceof Error ? error.message : 'Statistics unavailable' }, { status: 503 });
  }
}
