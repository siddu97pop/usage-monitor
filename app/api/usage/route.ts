import { NextResponse } from 'next/server';
import { getUsageStats } from '@/lib/usage-service';
import { checkOllamaHealth } from '@/lib/ollama-sync';
import { getClaudeUsage, formatResetTime } from '@/lib/claude-usage';
import { getCodexUsage } from '@/lib/codex-usage';
import type { UsageResponse } from '@/types/usage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

export async function GET() {
  try {
    const [providers, ollamaHealth, claudeUsage, codexUsage] = await Promise.all([
      getUsageStats(),
      checkOllamaHealth(),
      getClaudeUsage(),
      getCodexUsage(),
    ]);

    const enriched = providers.map((p) => {

      // ── Codex ─────────────────────────────────────────────────────────────
      if (p.provider === 'codex') {
        if (!codexUsage.available) {
          return { ...p, planUsage: undefined };
        }
        const has5h = codexUsage.fiveHourPct !== null;
        const has7d = codexUsage.sevenDayPct !== null;

        // Avg tokens per session (only available when SQLite is local)
        const avgTokens =
          codexUsage.sessionsWeek > 0
            ? Math.round(codexUsage.tokensWeek / codexUsage.sessionsWeek)
            : undefined;

        return {
          ...p,
          syncStatus: 'synced' as const,
          latestSync: codexUsage.latestSessionAt
            ? new Date(codexUsage.latestSessionAt * 1000).toISOString()
            : codexUsage.checkedAt,
          modelName: codexUsage.model ?? p.modelName,
          totalUsage: codexUsage.sessionsWeek || p.totalUsage,
          usageUnit: 'sessions',
          tokens: codexUsage.tokensWeek || p.tokens,
          sessionsToday: codexUsage.sessionsToday,
          sessionsWeek: codexUsage.sessionsWeek,
          avgTokens,
          planUsage: {
            tier: codexUsage.tier ?? 'Plus',
            lastUpdated: codexUsage.checkedAt,
            limits: [
              {
                label: 'Current Session',
                sublabel: has5h
                  ? formatResetTime(codexUsage.resetsAt5h)
                  : `${codexUsage.sessionsToday} sessions · ${fmtTokens(codexUsage.tokensToday)} tokens`,
                percentUsed: has5h
                  ? Math.round((codexUsage.fiveHourPct ?? 0) * 10) / 10
                  : 0,
              },
              {
                label: 'Weekly Limits',
                sublabel: has7d
                  ? formatResetTime(codexUsage.resetsAt7d)
                  : `${codexUsage.sessionsWeek} sessions · ${fmtTokens(codexUsage.tokensWeek)} tokens`,
                percentUsed: has7d
                  ? Math.round((codexUsage.sevenDayPct ?? 0) * 10) / 10
                  : 0,
              },
            ],
          },
        };
      }

      // ── Ollama ────────────────────────────────────────────────────────────
      if (p.provider === 'ollama') {
        return {
          ...p,
          syncStatus: ollamaHealth.connected ? ('synced' as const) : ('error' as const),
          latestSync: ollamaHealth.checkedAt,
          planUsage: undefined,
          liveData: {
            connected: ollamaHealth.connected,
            modelCount: ollamaHealth.modelCount,
            models: ollamaHealth.models,
            error: ollamaHealth.error,
          },
        };
      }

      // ── Claude ────────────────────────────────────────────────────────────
      if (p.provider === 'claude') {
        if (!claudeUsage.available) {
          return { ...p, planUsage: undefined };
        }
        return {
          ...p,
          syncStatus: 'synced' as const,
          latestSync: claudeUsage.checkedAt,
          planUsage: {
            tier: 'Pro',
            lastUpdated: claudeUsage.checkedAt,
            limits: [
              {
                label: 'Current Session',
                sublabel: formatResetTime(claudeUsage.resetsAt5h),
                percentUsed: Math.round((claudeUsage.fiveHourPct ?? 0) * 10) / 10,
              },
              {
                label: 'Weekly Limits',
                sublabel: claudeUsage.resetsAt7d
                  ? formatResetTime(claudeUsage.resetsAt7d)
                  : '7-day rolling window',
                percentUsed: Math.round((claudeUsage.sevenDayPct ?? 0) * 10) / 10,
              },
            ],
          },
        };
      }

      return p;
    });

    const response: UsageResponse = {
      providers: enriched,
      refreshedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    );
  }
}
