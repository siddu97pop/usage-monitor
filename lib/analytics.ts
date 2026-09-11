import type { Provider } from '@/types/usage';

export type AnalyticsProvider = Extract<Provider, 'claude' | 'codex'>;

export interface AnalyticsPayload {
  analytics_version?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  cache_creation_tokens?: number;
  // v3: cache writes split by TTL. cache_creation_tokens (v2) is treated as
  // the 5m bucket when the split fields are absent, so old rows still price.
  cache_creation_5m_tokens?: number;
  cache_creation_1h_tokens?: number;
  reasoning_tokens?: number;
  // v3: raw thinking tokens, already counted inside output_tokens. Informational only.
  thinking_tokens?: number;
  duration_ms?: number | null;
  time_to_first_token_ms?: number | null;
  context_window?: number | null;
  peak_context_tokens?: number | null;
  peak_input_tokens?: number | null;
  compactions?: number;
  tool_calls?: number;
  web_searches?: number;
  project?: string;
  // v3 additions — all optional, absent on v2 rows.
  tool_breakdown?: Record<string, number>;
  sidechain_messages?: number;
  sidechain_tokens?: number;
  is_agent_session?: boolean;
  stop_reasons?: Record<string, number>;
  service_tiers?: Record<string, number>;
  speeds?: Record<string, number>;
  effort?: string | null;
  entrypoint?: string | null;
  cc_version?: string | null;
  git_branch?: string | null;
}

export interface AnalyticsSession {
  id: string;
  provider: AnalyticsProvider;
  timestamp: string;
  model: string;
  project: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  durationMs: number | null;
  timeToFirstTokenMs: number | null;
  contextUtilization: number | null;
  compactions: number;
  toolCalls: number;
  apiEquivalentCost: number | null;
  codexCredits: number | null;
  // v3 additions — default to safe values when the source row lacks them.
  analyticsVersion: number;
  thinkingTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  toolBreakdown: Record<string, number>;
  sidechainMessages: number;
  sidechainTokens: number;
  isAgentSession: boolean;
  stopReasons: Record<string, number>;
  serviceTiers: Record<string, number>;
  speeds: Record<string, number>;
  effort: string | null;
  entrypoint: string | null;
  ccVersion: string | null;
  gitBranch: string | null;
}

export interface AnalyticsSummary {
  totalTokens: number;
  sessions: number;
  activeDays: number;
  averageTokensPerSession: number;
  apiEquivalentCost: number | null;
  codexCredits: number | null;
  cacheHitRatio: number | null;
  outputInputRatio: number | null;
  averageContextUtilization: number | null;
  compactions: number;
  averageDurationMs: number | null;
  averageTimeToFirstTokenMs: number | null;
}

export interface AnalyticsResponse {
  summary: AnalyticsSummary;
  daily: Array<{ date: string; input: number; output: number; cached: number; reasoning: number; sessions: number }>;
  providers: Array<{ name: AnalyticsProvider; tokens: number; sessions: number }>;
  models: Array<{ name: string; provider: AnalyticsProvider; tokens: number; sessions: number }>;
  projects: Array<{ name: string; tokens: number; sessions: number }>;
  heatmap: Array<{ day: number; hour: number; sessions: number; tokens: number }>;
  sessions: AnalyticsSession[];
  // v3 behavioural/quality aggregates. Empty arrays / zeroed splits when the
  // range contains only v2 (or no) data — components render an empty state.
  toolMix: Array<{ name: string; count: number }>;
  threadSplit: { mainTokens: number; subagentTokens: number };
  entrypoints: Array<{ name: string; sessions: number }>;
  effortLevels: Array<{ name: string; sessions: number }>;
  stopReasons: Array<{ name: string; count: number }>;
  speeds: Array<{ name: string; count: number }>;
  ccVersions: Array<{ name: string; sessions: number }>;
  cacheWriteSplit: { fiveMinute: number; oneHour: number };
  range: { days: number; provider: AnalyticsProvider | 'all'; timezone: 'Asia/Dubai' };
  dataQuality: {
    // Three tiers: v3 (full v3 telemetry), v2 (token-accurate, no v3 detail),
    // legacy (pre-v2 / unversioned rows — most partial).
    v3Sessions: number;
    v2Sessions: number;
    legacySessions: number;
    measuredSessions: number;
    partialSessions: number;
    apiEquivalentSessions: number;
    codexCreditSessions: number;
    lastSync: string | null;
  };
  refreshedAt: string;
}

const CODEX_CREDIT_RATES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6-astra': { input: 250, cached: 25, output: 1250 },
  'gpt-5.6-sol': { input: 100, cached: 10, output: 500 },
  'gpt-5.6-terra': { input: 50, cached: 5, output: 300 },
  'gpt-5.6-luna': { input: 5, cached: 0.5, output: 30 },
  'gpt-5.6': { input: 100, cached: 10, output: 500 },
  'gpt-5.5': { input: 125, cached: 12.5, output: 750 },
  'gpt-5.4': { input: 62.5, cached: 6.25, output: 375 },
  'gpt-5.4-mini': { input: 18.75, cached: 1.875, output: 113 },
  'gpt-5.3-codex': { input: 43.75, cached: 4.375, output: 350 },
  'gpt-5.2': { input: 43.75, cached: 4.375, output: 350 },
};

interface OpenAiUsdRate {
  short: { input: number; cached: number; cacheWrite?: number; output: number };
  long?: { input: number; cached: number; cacheWrite?: number; output: number };
}

// Standard API rates per 1M tokens, per https://platform.openai.com/docs/pricing
// (fetched 2026-09-11). Requests above 272K input tokens use the long-context
// tier where one is published. GPT-5.6 Sol's pricing below is promotional,
// published as in effect at least through November 21, 2026.
const OPENAI_USD_RATES: Record<string, OpenAiUsdRate> = {
  'gpt-6-astra': { short: { input: 10, cached: 1, cacheWrite: 12.5, output: 50 }, long: { input: 20, cached: 2, cacheWrite: 25, output: 75 } },
  'gpt-5.6-sol': { short: { input: 4, cached: 0.4, cacheWrite: 5, output: 20 }, long: { input: 8, cached: 0.8, cacheWrite: 10, output: 30 } },
  'gpt-5.6': { short: { input: 4, cached: 0.4, cacheWrite: 5, output: 20 }, long: { input: 8, cached: 0.8, cacheWrite: 10, output: 30 } },
  'gpt-5.6-terra': { short: { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 }, long: { input: 4, cached: 0.4, cacheWrite: 5, output: 18 } },
  'gpt-5.6-luna': { short: { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 1.2 }, long: { input: 0.4, cached: 0.04, cacheWrite: 0.5, output: 1.8 } },
  'gpt-5.5': { short: { input: 5, cached: 0.5, output: 30 }, long: { input: 10, cached: 1, output: 45 } },
  'gpt-5.4': { short: { input: 2.5, cached: 0.25, output: 15 }, long: { input: 5, cached: 0.5, output: 22.5 } },
  'gpt-5.4-mini': { short: { input: 0.75, cached: 0.075, output: 4.5 } },
};

// API-equivalent rates are intentionally limited to stable, public model IDs.
// Confirmed against https://platform.claude.com/docs/en/about-claude/pricing
// (fetched 2026-09-11). Cache write rates are published per-model (5m and 1h
// columns), not derived from a multiplier — Claude Sonnet 5's introductory
// $2/$10 pricing is now permanent standard pricing per that page's note.
// Claude Fable 5.1 / Claude Mythos 5.1 use a 0.025x cache-read multiplier
// ($0.25/MTok) instead of the standard 0.1x used by every other model here.
const CLAUDE_USD_RATES: Record<string, { input: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number; output: number }> = {
  'claude-fable-5-1': { input: 10, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 },
  'claude-mythos-5-1': { input: 10, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 },
  'claude-fable-5': { input: 10, cacheRead: 1, cacheWrite5m: 12.5, cacheWrite1h: 20, output: 50 },
  'claude-opus-5': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-opus-4-8': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-opus-4-7': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-opus-4-6': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-sonnet-5': { input: 2, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4, output: 10 },
  'claude-sonnet-4-6': { input: 3, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6, output: 15 },
  'claude-sonnet-4-5': { input: 3, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6, output: 15 },
  'claude-opus-4-5': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-opus-4-5-20251101': { input: 5, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, output: 25 },
  'claude-haiku-4-5': { input: 1, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, output: 5 },
};

export function calculateEstimates(provider: AnalyticsProvider, model: string, payload: AnalyticsPayload) {
  const input = Number(payload.input_tokens ?? 0);
  const cached = Number(payload.cached_input_tokens ?? 0);
  const cacheWrite5m = Number(payload.cache_creation_5m_tokens ?? payload.cache_creation_tokens ?? 0);
  const cacheWrite1h = Number(payload.cache_creation_1h_tokens ?? 0);
  const output = Number(payload.output_tokens ?? 0);

  if (provider === 'codex') {
    const modelKey = model.toLowerCase();
    const creditRate = CODEX_CREDIT_RATES[modelKey];
    const apiRateCard = OPENAI_USD_RATES[modelKey];
    const apiRate = Number(payload.peak_input_tokens ?? 0) > 272_000 && apiRateCard?.long
      ? apiRateCard.long
      : apiRateCard?.short;
    // Codex reports cached input as a subset of input_tokens. Price the
    // uncached remainder at the full rate so cached tokens are not counted twice.
    const uncachedInput = Math.max(0, input - cached);
    const cacheWrite = cacheWrite5m + cacheWrite1h;
    return {
      apiEquivalentCost: apiRate
        ? (uncachedInput * apiRate.input + cached * apiRate.cached + cacheWrite * (apiRate.cacheWrite ?? apiRate.input) + output * apiRate.output) / 1_000_000
        : null,
      codexCredits: creditRate
        ? (uncachedInput * creditRate.input + cached * creditRate.cached + cacheWrite * creditRate.input + output * creditRate.output) / 1_000_000
        : null,
    };
  }

  const rate = CLAUDE_USD_RATES[model.toLowerCase()];
  return {
    apiEquivalentCost: rate
      ? (input * rate.input + cached * rate.cacheRead + cacheWrite5m * rate.cacheWrite5m + cacheWrite1h * rate.cacheWrite1h + output * rate.output) / 1_000_000
      : null,
    codexCredits: null,
  };
}
