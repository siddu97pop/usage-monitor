/**
 * Usage Service — aggregates raw UsageRecord rows into ProviderStats.
 *
 * This is the single place to swap mock data for live DB queries.
 * When DATABASE_URL is set and records exist, live data is returned.
 * When the DB is unavailable or empty, mock data is returned as a fallback.
 */

import { subDays, subHours, startOfHour, format, getDay } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { MOCK_DATA } from '@/lib/mock-data';
import type { Provider, ProviderStats, HourlyDataPoint, WeeklyDataPoint } from '@/types/usage';

const PROVIDER_META: Record<Provider, Pick<ProviderStats, 'displayName' | 'accent' | 'accentDim' | 'sourceType'>> = {
  codex: {
    displayName: 'Codex',
    accent: '#10B981',
    accentDim: 'rgba(16, 185, 129, 0.15)',
    sourceType: 'subscription',
  },
  claude: {
    displayName: 'Claude',
    accent: '#A78BFA',
    accentDim: 'rgba(167, 139, 250, 0.15)',
    sourceType: 'subscription',
  },
  ollama: {
    displayName: 'Ollama',
    accent: '#60A5FA',
    accentDim: 'rgba(96, 165, 250, 0.15)',
    sourceType: 'api',
  },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getUsageStats(): Promise<ProviderStats[]> {
  try {
    const now = new Date();
    const since7d = subDays(now, 7);
    const since24h = subHours(now, 24);

    // ── Query all three providers in parallel ──────────────────────────────

    const [allRecords, syncLogs] = await Promise.all([
      prisma.usageRecord.findMany({
        where: { timestamp: { gte: since7d } },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.syncLog.findMany({
        orderBy: { synced_at: 'desc' },
        distinct: ['provider'],
      }),
    ]);

    if (allRecords.length === 0) {
      // No data in DB — return mock data
      return MOCK_DATA;
    }

    const providers: Provider[] = ['codex', 'claude', 'ollama'];

    return providers.map((provider) => {
      const meta = PROVIDER_META[provider];
      const records = allRecords.filter((r) => r.provider === provider);
      const syncLog = syncLogs.find((s) => s.provider === provider);

      // ── Hourly buckets (last 24 h) ───────────────────────────────────────
      const hourlyMap = new Map<string, number>();
      for (let h = 23; h >= 0; h--) {
        const bucket = startOfHour(subHours(now, h));
        hourlyMap.set(format(bucket, 'HH'), 0);
      }
      for (const r of records) {
        if (r.timestamp >= since24h) {
          const key = format(r.timestamp, 'HH');
          if (hourlyMap.has(key)) {
            hourlyMap.set(key, (hourlyMap.get(key) ?? 0) + r.usage_value);
          }
        }
      }
      const hourlyData: HourlyDataPoint[] = Array.from(hourlyMap.entries()).map(
        ([label, value]) => ({ label: `${label}h`, value })
      );

      // ── Weekly buckets (last 7 days) ─────────────────────────────────────
      const weeklyMap = new Map<string, number>();
      for (let d = 6; d >= 0; d--) {
        const day = subDays(now, d);
        weeklyMap.set(DAYS[getDay(day)], 0);
      }
      for (const r of records) {
        const key = DAYS[getDay(r.timestamp)];
        if (weeklyMap.has(key)) {
          weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + r.usage_value);
        }
      }
      const weeklyData: WeeklyDataPoint[] = Array.from(weeklyMap.entries()).map(
        ([label, value]) => ({ label, value })
      );

      // ── Aggregate stats ──────────────────────────────────────────────────
      const totalUsage = records.reduce((s, r) => s + r.usage_value, 0);
      const totalTokens = records.reduce((s, r) => s + (r.tokens ?? 0), 0);
      const totalCost = records.reduce((s, r) => s + (r.estimated_cost ?? 0), 0);
      const latestRecord = records[records.length - 1];

      return {
        ...meta,
        provider,
        totalUsage: Math.round(totalUsage),
        usageUnit: latestRecord?.usage_unit ?? 'events',
        latestSync: syncLog?.synced_at?.toISOString() ?? null,
        syncStatus: syncLog?.status === 'success' ? 'synced' : 'error',
        hourlyData,
        weeklyData,
        tokens: totalTokens || undefined,
        estimatedCost: totalCost ? parseFloat(totalCost.toFixed(2)) : undefined,
        modelName: latestRecord?.model_name ?? undefined,
      } satisfies ProviderStats;
    });
  } catch {
    // DB not available — fall back to mock data silently in production
    return MOCK_DATA;
  }
}
