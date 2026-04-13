'use client';

import { formatDistanceToNow } from 'date-fns';
import PlanUsageLimits from './PlanUsageLimits';
import type { ProviderStats } from '@/types/usage';

interface ProviderCardProps {
  stats: ProviderStats;
}

function StatusDot({ status }: { status: ProviderStats['syncStatus'] }) {
  const colors: Record<ProviderStats['syncStatus'], string> = {
    synced: 'bg-emerald-400',
    pending: 'bg-amber-400',
    error: 'bg-red-400',
    manual: 'bg-slate-400',
  };
  const labels: Record<ProviderStats['syncStatus'], string> = {
    synced: 'Live',
    pending: 'Pending',
    error: 'Error',
    manual: 'Manual',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${colors[status]} ${
          status === 'synced' ? 'animate-pulse-slow' : ''
        }`}
      />
      <span className="text-[11px] font-medium text-slate-400">
        {labels[status]}
      </span>
    </div>
  );
}

function SourceBadge({ sourceType }: { sourceType: ProviderStats['sourceType'] }) {
  const labels: Record<ProviderStats['sourceType'], string> = {
    subscription: 'Subscription',
    api: 'API',
    manual: 'Manual',
    proxy: 'Proxy',
  };
  return (
    <span className="rounded border border-[#1e1e2e] bg-[#0a0a0f] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
      {labels[sourceType]}
    </span>
  );
}

function StatItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  );
}

function formatSync(iso: string | null) {
  if (!iso) return 'Never';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

function formatTokens(t?: number) {
  if (!t) return null;
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(0)}K`;
  return t.toString();
}

export default function ProviderCard({ stats }: ProviderCardProps) {
  const {
    displayName,
    accent,
    accentDim,
    totalUsage,
    usageUnit,
    latestSync,
    syncStatus,
    tokens,
    estimatedCost,
    modelName,
    sourceType,
    planUsage,
    liveData,
  } = stats;

  return (
    <div
      className="relative flex flex-col gap-5 overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 shadow-lg"
      style={{
        // Subtle top accent line
        borderTopColor: accent,
        borderTopWidth: '2px',
        background: `linear-gradient(160deg, ${accentDim} 0%, #111118 30%)`,
      }}
    >
      {/* Card shine overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-40"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%)',
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-100">
              {displayName}
            </h2>
            <SourceBadge sourceType={sourceType} />
          </div>
          {modelName && (
            <span className="font-mono text-[10px] text-slate-500">
              {modelName}
            </span>
          )}
        </div>
        <StatusDot status={syncStatus} />
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <StatItem
          label="Total"
          value={`${totalUsage.toLocaleString()} ${usageUnit}`}
          accent={accent}
        />
        {tokens && (
          <StatItem
            label="Tokens"
            value={formatTokens(tokens) ?? '—'}
            accent={accent}
          />
        )}
        {estimatedCost !== undefined && (
          <StatItem
            label="Est. Cost"
            value={`$${estimatedCost.toFixed(2)}`}
            accent={accent}
          />
        )}
        {liveData?.connected && (
          <StatItem
            label="Models"
            value={`${liveData.modelCount} available`}
            accent={accent}
          />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-widest text-slate-500">
            Last Sync
          </span>
          <span className="text-[11px] text-slate-400">{formatSync(latestSync)}</span>
        </div>
      </div>

      {/* ── Plan Usage Limits ────────────────────────────────────────────── */}
      {planUsage && (
        <PlanUsageLimits planUsage={planUsage} accent={accent} />
      )}
    </div>
  );
}
