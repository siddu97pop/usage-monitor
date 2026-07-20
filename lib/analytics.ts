import type { Provider } from '@/types/usage';

export type AnalyticsProvider = Extract<Provider, 'claude' | 'codex'>;

export interface AnalyticsPayload {
  analytics_version?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  cache_creation_tokens?: number;
  reasoning_tokens?: number;
  duration_ms?: number | null;
  time_to_first_token_ms?: number | null;
  context_window?: number | null;
  peak_context_tokens?: number | null;
  compactions?: number;
  tool_calls?: number;
  web_searches?: number;
  project?: string;
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
  range: { days: number; provider: AnalyticsProvider | 'all'; timezone: 'Asia/Dubai' };
  dataQuality: { measuredSessions: number; partialSessions: number; lastSync: string | null };
  refreshedAt: string;
}

const CODEX_CREDIT_RATES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-5.6-sol': { input: 62.5, cached: 6.25, output: 375 },
  'gpt-5.6-terra': { input: 31.25, cached: 3.125, output: 187.5 },
  'gpt-5.6-luna': { input: 12.5, cached: 1.25, output: 75 },
  'gpt-5.6': { input: 62.5, cached: 6.25, output: 375 },
  'gpt-5.5': { input: 62.5, cached: 6.25, output: 375 },
  'gpt-5.4': { input: 62.5, cached: 6.25, output: 375 },
  'gpt-5.4-mini': { input: 18.75, cached: 1.875, output: 113 },
  'gpt-5.3-codex': { input: 43.75, cached: 4.375, output: 350 },
  'gpt-5.2': { input: 43.75, cached: 4.375, output: 350 },
};

// API-equivalent rates are intentionally limited to stable, public model IDs.
const CLAUDE_USD_RATES: Record<string, { input: number; cacheRead: number; cacheWrite: number; output: number }> = {
  'claude-fable-5': { input: 10, cacheRead: 1, cacheWrite: 20, output: 50 },
  'claude-opus-4-8': { input: 5, cacheRead: 0.5, cacheWrite: 10, output: 25 },
  'claude-opus-4-7': { input: 5, cacheRead: 0.5, cacheWrite: 10, output: 25 },
  'claude-opus-4-6': { input: 15, cacheRead: 1.5, cacheWrite: 30, output: 75 },
  'claude-sonnet-5': { input: 3, cacheRead: 0.3, cacheWrite: 6, output: 15 },
  'claude-sonnet-4-6': { input: 3, cacheRead: 0.3, cacheWrite: 6, output: 15 },
  'claude-haiku-4-5': { input: 1, cacheRead: 0.1, cacheWrite: 2, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, cacheRead: 0.1, cacheWrite: 2, output: 5 },
};

export function calculateEstimates(provider: AnalyticsProvider, model: string, payload: AnalyticsPayload) {
  const input = Number(payload.input_tokens ?? 0);
  const cached = Number(payload.cached_input_tokens ?? 0);
  const cacheWrite = Number(payload.cache_creation_tokens ?? 0);
  const output = Number(payload.output_tokens ?? 0);

  if (provider === 'codex') {
    const rate = CODEX_CREDIT_RATES[model.toLowerCase()];
    return {
      apiEquivalentCost: null,
      codexCredits: rate ? (input * rate.input + cached * rate.cached + output * rate.output) / 1_000_000 : null,
    };
  }

  const rate = CLAUDE_USD_RATES[model.toLowerCase()];
  return {
    apiEquivalentCost: rate
      ? (input * rate.input + cached * rate.cacheRead + cacheWrite * rate.cacheWrite + output * rate.output) / 1_000_000
      : null,
    codexCredits: null,
  };
}
