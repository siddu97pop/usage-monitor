/**
 * Static mock data — used as fallback when the database is unavailable,
 * or as the initial data shape for local development without a DB.
 *
 * To swap to live data: implement the ingestion path in app/api/usage/route.ts
 * and the mock fallback will be bypassed automatically.
 */

import type { ProviderStats } from '@/types/usage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genHourly(baseMin: number, baseMax: number, sparsity = 0.7) {
  return Array.from({ length: 24 }, (_, i) => ({
    label: `${String(i).padStart(2, '0')}h`,
    value: Math.random() < sparsity ? Math.floor(Math.random() * (baseMax - baseMin) + baseMin) : 0,
  }));
}

function genWeekly(baseMin: number, baseMax: number) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((label) => ({
    label,
    value: Math.floor(Math.random() * (baseMax - baseMin) + baseMin),
  }));
}

// ─── Mock providers ───────────────────────────────────────────────────────────

export const MOCK_DATA: ProviderStats[] = [
  {
    provider: 'codex',
    displayName: 'Codex',
    accent: '#10B981',
    accentDim: 'rgba(16, 185, 129, 0.15)',
    totalUsage: 847,
    usageUnit: 'messages',
    latestSync: new Date(Date.now() - 1000 * 60 * 14).toISOString(), // 14 min ago
    syncStatus: 'synced',
    hourlyData: genHourly(0, 9),
    weeklyData: genWeekly(60, 180),
    tokens: 2_450_000,
    estimatedCost: 4.9,
    modelName: 'codex-1',
    sourceType: 'subscription',
    planUsage: {
      tier: 'Plus',
      lastUpdated: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      limits: [
        {
          label: 'Current Session',
          sublabel: 'Resets in 1 hr 12 min',
          percentUsed: 45,
        },
        {
          label: 'Weekly Limits',
          sublabel: 'Resets Fri 10:00 AM',
          percentUsed: 31,
        },
      ],
    },
  },
  {
    provider: 'claude',
    displayName: 'Claude',
    accent: '#A78BFA',
    accentDim: 'rgba(167, 139, 250, 0.15)',
    totalUsage: 312,
    usageUnit: 'messages',
    latestSync: new Date(Date.now() - 1000 * 60 * 3).toISOString(), // 3 min ago
    syncStatus: 'synced',
    hourlyData: genHourly(0, 13, 0.6),
    weeklyData: genWeekly(30, 90),
    tokens: 1_820_000,
    estimatedCost: 5.46,
    modelName: 'claude-sonnet-4-6',
    sourceType: 'subscription',
  },
  {
    provider: 'ollama',
    displayName: 'Ollama',
    accent: '#60A5FA',
    accentDim: 'rgba(96, 165, 250, 0.15)',
    totalUsage: 1_943,
    usageUnit: 'requests',
    latestSync: new Date(Date.now() - 1000 * 30).toISOString(), // 30 sec ago
    syncStatus: 'synced',
    hourlyData: genHourly(0, 28),
    weeklyData: genWeekly(100, 420),
    tokens: 940_000,
    estimatedCost: 0.94,
    modelName: 'llama3:8b',
    sourceType: 'api',
  },
];
