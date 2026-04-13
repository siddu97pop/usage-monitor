'use client';

import { formatDistanceToNow } from 'date-fns';
import PlanUsageLimits from './PlanUsageLimits';
import type { ProviderStats } from '@/types/usage';

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ProviderStats['syncStatus'] }) {
  const map: Record<ProviderStats['syncStatus'], { dot: string; label: string }> = {
    synced:  { dot: 'bg-emerald-400 animate-pulse-slow', label: 'Live' },
    pending: { dot: 'bg-amber-400', label: 'Pending' },
    error:   { dot: 'bg-red-400',   label: 'Error' },
    manual:  { dot: 'bg-slate-400', label: 'Manual' },
  };
  const { dot, label } = map[status];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
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

function StatPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 truncate">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums truncate" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

function fmtTokens(t?: number) {
  if (!t) return '—';
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${Math.round(t / 1_000)}K`;
  return t.toString();
}

function fmtSync(iso: string | null) {
  if (!iso) return 'Never';
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return '—'; }
}

// ── Per-provider body sections ────────────────────────────────────────────────

function CodexBody({ stats }: { stats: ProviderStats }) {
  const { accent, sessionsToday, sessionsWeek, avgTokens, tokens, planUsage } = stats;
  const hasStats = (sessionsWeek ?? 0) > 0 || (tokens ?? 0) > 0;

  return (
    <>
      {hasStats && (
        <div className="grid grid-cols-3 gap-3">
          <StatPill
            label="Today"
            value={`${sessionsToday ?? 0} sessions`}
            accent={accent}
          />
          <StatPill
            label="This Week"
            value={`${sessionsWeek ?? 0} sessions`}
            accent={accent}
          />
          <StatPill
            label="Avg / Session"
            value={avgTokens ? fmtTokens(avgTokens) + ' tok' : fmtTokens(tokens) + ' total'}
            accent={accent}
          />
        </div>
      )}

      {planUsage ? (
        <PlanUsageLimits planUsage={planUsage} accent={accent} />
      ) : (
        <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] px-4 py-6 text-center">
          <p className="text-[12px] text-slate-500">Usage data syncing…</p>
          <p className="mt-0.5 text-[11px] text-slate-600">Cron runs every 5 min</p>
        </div>
      )}
    </>
  );
}

function ClaudeBody({ stats }: { stats: ProviderStats }) {
  const { accent, planUsage } = stats;

  if (!planUsage) {
    return (
      <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] px-4 py-6 text-center">
        <p className="text-[12px] text-slate-500">Rate limit data unavailable</p>
        <p className="mt-0.5 text-[11px] text-slate-600">Requires active Claude session</p>
      </div>
    );
  }

  return <PlanUsageLimits planUsage={planUsage} accent={accent} />;
}

function OllamaBody({ stats }: { stats: ProviderStats }) {
  const { accent, liveData } = stats;

  if (!liveData) {
    return (
      <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] px-4 py-6 text-center">
        <p className="text-[12px] text-slate-500">No connection data</p>
      </div>
    );
  }

  const { connected, modelCount, models = [], error } = liveData;

  return (
    <div className="flex flex-col gap-4">
      {/* Connection status row */}
      <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-200">
            {connected ? 'Connected' : 'Offline'}
          </span>
          <span
            className="font-mono text-[12px]"
            style={{ color: connected ? accent : '#F87171' }}
          >
            {connected ? `${modelCount} models` : error ?? 'Not reachable'}
          </span>
        </div>
        {!connected && (
          <p className="mt-1.5 text-[11px] text-slate-600">
            No API key configured — proxy tracking coming soon
          </p>
        )}
      </div>

      {/* Model chips */}
      {connected && models.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">
            Available Models
          </p>
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <span
                key={m}
                className="rounded-md border border-[#1e1e2e] bg-[#0d0d14] px-2 py-0.5 font-mono text-[10px] text-slate-400"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {connected && models.length === 0 && (
        <p className="text-[12px] text-slate-500">No models listed</p>
      )}
    </div>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────

export default function ProviderCard({ stats }: { stats: ProviderStats }) {
  const { displayName, accent, accentDim, modelName, sourceType, syncStatus, provider } = stats;

  return (
    <div
      className="relative flex flex-col gap-5 overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 shadow-lg"
      style={{
        borderTopColor: accent,
        borderTopWidth: '2px',
        background: `linear-gradient(160deg, ${accentDim} 0%, #111118 30%)`,
      }}
    >
      {/* Shine overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-40"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%)' }}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-100">
              {displayName}
            </h2>
            <SourceBadge sourceType={sourceType} />
          </div>
          {modelName && (
            <span className="font-mono text-[10px] text-slate-500">{modelName}</span>
          )}
          {!modelName && (
            <span className="font-mono text-[10px] text-slate-600">
              {fmtSync(stats.latestSync)}
            </span>
          )}
        </div>
        <StatusDot status={syncStatus} />
      </div>

      {/* Body — per provider */}
      {provider === 'codex'  && <CodexBody  stats={stats} />}
      {provider === 'claude' && <ClaudeBody stats={stats} />}
      {provider === 'ollama' && <OllamaBody stats={stats} />}
    </div>
  );
}
