'use client';

import { formatDistanceToNow } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import type { PlanUsage, PlanLimit } from '@/types/usage';

interface PlanUsageLimitsProps {
  planUsage: PlanUsage;
  accent: string;
}

function UsageBar({
  limit,
  accent,
  isLast,
}: {
  limit: PlanLimit;
  accent: string;
  isLast: boolean;
}) {
  const pct = Math.min(100, Math.max(0, limit.percentUsed));

  // Colour shifts from accent → amber → red as usage climbs
  let barColor = accent;
  if (pct >= 90) barColor = '#F87171'; // red-400
  else if (pct >= 75) barColor = '#FBBF24'; // amber-400

  const displayPct = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;

  return (
    <div className={!isLast ? 'pb-4 border-b border-[#1e1e2e] mb-4' : 'pb-1'}>
      {/* Row 1: Label + percentage */}
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[13px] font-semibold text-slate-200">{limit.label}</p>
        <span
          className="font-mono text-[13px] font-medium tabular-nums"
          style={{ color: barColor }}
        >
          {displayPct} used
        </span>
      </div>

      {/* Row 2: Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2a3a]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: pct === 0 ? '0%' : `${pct}%`,
            backgroundColor: pct === 0 ? '#2a2a3a' : barColor,
            boxShadow: pct > 0 ? `0 0 6px ${barColor}44` : 'none',
          }}
        />
      </div>

      {/* Row 3: Reset time below bar */}
      <p className="mt-1.5 text-[11px]" style={{ color: pct === 0 ? '#475569' : `${barColor}cc` }}>
        {limit.sublabel}
      </p>
    </div>
  );
}

export default function PlanUsageLimits({ planUsage, accent }: PlanUsageLimitsProps) {
  const { tier, limits, lastUpdated } = planUsage;

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(lastUpdated), { addSuffix: true });
    } catch {
      return null;
    }
  })();

  return (
    <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] px-4 pt-3 pb-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-slate-100">Plan usage limits</p>
        <span className="font-mono text-[12px] font-medium text-slate-400">{tier}</span>
      </div>

      {/* Usage rows */}
      <div>
        {limits.map((limit, i) => (
          <UsageBar
            key={limit.label}
            limit={limit}
            accent={accent}
            isLast={i === limits.length - 1}
          />
        ))}
      </div>

      {/* Footer */}
      {timeAgo && (
        <div className="mt-2 flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 text-slate-600" />
          <span className="text-[11px] text-slate-600">Last updated: {timeAgo}</span>
        </div>
      )}
    </div>
  );
}
