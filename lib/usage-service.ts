/**
 * Usage Service — aggregates UsageRecord rows from Supabase into ProviderStats.
 *
 * No mock fallback. If the DB is unavailable or empty, each provider card
 * receives a zero/empty state so real data can be merged in by the API route.
 */

import { prisma } from '@/lib/prisma';
import type { Provider, ProviderStats } from '@/types/usage';

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

function emptyProvider(provider: Provider, syncStatus: ProviderStats['syncStatus'] = 'pending'): ProviderStats {
  return {
    ...PROVIDER_META[provider],
    provider,
    totalUsage: 0,
    usageUnit: 'sessions',
    latestSync: null,
    syncStatus,
  };
}

export async function getUsageStats(): Promise<ProviderStats[]> {
  const providers: Provider[] = ['codex', 'claude', 'ollama'];

  try {
    const [allRecords, syncLogs] = await Promise.all([
      prisma.usageRecord.findMany({
        where: {
          timestamp: { gte: new Date(Date.now() - 7 * 86_400_000) },
          source_type: { not: 'rate_limit' },
        },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.syncLog.findMany({
        where: { provider: { in: ['codex', 'claude', 'ollama'] } },
        orderBy: { synced_at: 'desc' },
        distinct: ['provider'],
      }),
    ]);

    return providers.map((provider) => {
      const records = allRecords.filter((r) => r.provider === provider);
      const syncLog = syncLogs.find((s) => s.provider === provider);

      const totalUsage = records.reduce((s, r) => s + r.usage_value, 0);
      const totalTokens = records.reduce((s, r) => s + (r.tokens ?? 0), 0);
      const latestRecord = records[records.length - 1];

      return {
        ...PROVIDER_META[provider],
        provider,
        totalUsage: Math.round(totalUsage),
        usageUnit: latestRecord?.usage_unit ?? 'sessions',
        latestSync: syncLog?.synced_at?.toISOString() ?? null,
        syncStatus: syncLog?.status === 'success' ? 'synced' : 'pending',
        tokens: totalTokens || undefined,
        modelName: latestRecord?.model_name ?? undefined,
      } satisfies ProviderStats;
    });
  } catch {
    // DB unavailable — return empty state for each provider
    return providers.map((p) => emptyProvider(p, 'error'));
  }
}
