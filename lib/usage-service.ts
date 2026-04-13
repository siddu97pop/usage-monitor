/**
 * Usage Service — reads UsageRecord + SyncLog from Supabase via REST API.
 *
 * Uses HTTPS (not direct TCP) so it works from Vercel serverless functions
 * where direct PostgreSQL connections are blocked by network rules.
 */

import type { Provider, ProviderStats } from '@/types/usage';

const SUPABASE_URL      = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

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

async function sbFetch(path: string): Promise<unknown[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json() as Promise<unknown[]>;
}

interface UsageRow {
  provider: string;
  usage_value: number;
  usage_unit: string;
  tokens: number | null;
  model_name: string | null;
  timestamp: string;
}

interface SyncLogRow {
  provider: string;
  status: string;
  synced_at: string;
}

export async function getUsageStats(): Promise<ProviderStats[]> {
  const providers: Provider[] = ['codex', 'claude', 'ollama'];

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return providers.map((p) => emptyProvider(p, 'error'));
  }

  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [allRecords, syncLogs] = await Promise.all([
      sbFetch(
        `UsageRecord?timestamp=gte.${since}&source_type=neq.rate_limit&order=timestamp.asc`
      ) as Promise<UsageRow[]>,
      sbFetch(
        `SyncLog?provider=in.(codex,claude,ollama)&order=synced_at.desc`
      ) as Promise<SyncLogRow[]>,
    ]);

    // Deduplicate syncLogs to latest per provider
    const latestSync: Record<string, SyncLogRow> = {};
    for (const row of syncLogs) {
      if (!latestSync[row.provider]) latestSync[row.provider] = row;
    }

    return providers.map((provider) => {
      const records = (allRecords as UsageRow[]).filter((r) => r.provider === provider);
      const syncLog = latestSync[provider];

      const totalUsage = records.reduce((s, r) => s + r.usage_value, 0);
      const totalTokens = records.reduce((s, r) => s + (r.tokens ?? 0), 0);
      const latestRecord = records[records.length - 1];

      return {
        ...PROVIDER_META[provider],
        provider,
        totalUsage: Math.round(totalUsage),
        usageUnit: latestRecord?.usage_unit ?? 'sessions',
        latestSync: syncLog?.synced_at ?? null,
        syncStatus: syncLog?.status === 'success' ? 'synced' : 'pending',
        tokens: totalTokens || undefined,
        modelName: latestRecord?.model_name ?? undefined,
      } satisfies ProviderStats;
    });
  } catch {
    return providers.map((p) => emptyProvider(p, 'error'));
  }
}
