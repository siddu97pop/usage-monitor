'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, CircleDollarSign, Gauge, Layers3, MessagesSquare, RefreshCw } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Header from '@/components/Header';
import PageTabs from '@/components/PageTabs';
import type { AnalyticsProvider, AnalyticsResponse } from '@/lib/analytics';

type ProviderFilter = AnalyticsProvider | 'all';

const tokenFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat('en');

function formatDuration(ms: number | null) {
  if (ms === null) return 'Unavailable';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function formatPercent(value: number | null, digits = 0) {
  return value === null ? 'Unavailable' : `${(value * 100).toFixed(digits)}%`;
}

function EfficiencyItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="py-3 first:pt-0 last:pb-0"><div className="flex items-baseline justify-between gap-4"><span className="text-[11px] text-slate-500">{label}</span><span className="font-mono text-[13px] font-medium tabular-nums text-slate-200">{value}</span></div><p className="mt-1 text-[10px] text-slate-700">{detail}</p></div>;
}

function ActivityHeatmap({ values }: { values: AnalyticsResponse['heatmap'] }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(1, ...values.map((item) => item.tokens));
  const lookup = new Map(values.map((item) => [`${item.day}:${item.hour}`, item]));
  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[620px]">
        <div className="mb-2 grid grid-cols-[32px_repeat(24,minmax(16px,1fr))] gap-1 text-center font-mono text-[8px] text-slate-700"><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</span>)}</div>
        <div className="space-y-1">
          {days.map((day, dayIndex) => <div key={day} className="grid grid-cols-[32px_repeat(24,minmax(16px,1fr))] gap-1"><span className="self-center font-mono text-[9px] text-slate-600">{day}</span>{Array.from({ length: 24 }, (_, hour) => { const item = lookup.get(`${dayIndex}:${hour}`); const intensity = item ? Math.max(0.12, item.tokens / max) : 0.03; return <div key={hour} className="aspect-square rounded-[2px] border border-emerald-500/5" style={{ backgroundColor: `rgba(16, 185, 129, ${intensity})` }} title={`${day} ${String(hour).padStart(2, '0')}:00 · ${item?.sessions ?? 0} sessions · ${fullNumber.format(item?.tokens ?? 0)} tokens`} />; })}</div>)}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return (
    <div className="min-w-0 border-b border-[#1e1e2e] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex items-center gap-2 text-[11px] text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="mt-2 truncate font-mono text-xl font-medium tabular-nums text-slate-100" title={value}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-600">{detail}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#2a2a3a] bg-[#111118] px-3 py-2 shadow-lg">
      <p className="mb-1.5 font-mono text-[10px] text-slate-500">{label}</p>
      {payload.map((item) => <p key={item.name} className="text-[11px]" style={{ color: item.color }}>{item.name}: {fullNumber.format(item.value)}</p>)}
    </div>
  );
}

function Skeleton() {
  return <div className="mt-6 h-72 animate-pulse rounded-xl border border-[#1e1e2e] bg-[#111118]" />;
}

function EmptyPanelState({ legacySessions }: { legacySessions: number }) {
  return (
    <div className="flex h-40 items-center justify-center px-4 text-center text-[11px] text-slate-600">
      {legacySessions ? `No v3 telemetry in this range — ${legacySessions} legacy sessions contain partial detail` : 'No telemetry in this range yet'}
    </div>
  );
}

function RankedList({ items, total, formatValue }: { items: Array<{ name: string; value: number }>; total: number; formatValue: (value: number) => string }) {
  if (!items.length) return <p className="py-8 text-center text-[11px] text-slate-600">No data in this range.</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const share = total ? item.value / total : 0;
        return (
          <div key={item.name}>
            <div className="mb-1.5 flex items-center justify-between gap-4">
              <span className="truncate font-mono text-[11px] text-slate-400" title={item.name}>{item.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-600">{formatValue(item.value)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#1e1e2e]"><div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.max(1, share * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export default function StatisticsDashboard() {
  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionLimit, setSessionLimit] = useState(10);
  const [subTab, setSubTab] = useState<'tokens' | 'behaviour' | 'quality'>('tokens');

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/statistics?days=${days}&provider=${provider}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json() as AnalyticsResponse);
    } catch {
      setError('Detailed statistics could not be loaded. Try refreshing in a moment.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days, provider]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setSessionLimit(10); }, [days, provider]);

  const costLabel = data?.summary.apiEquivalentCost === null ? 'Unavailable' : `$${data?.summary.apiEquivalentCost.toFixed(2)}`;
  const daily = useMemo(() => data?.daily.map((item) => ({ ...item, label: item.date.slice(5) })) ?? [], [data]);
  const codexSessions = data?.providers.find((item) => item.name === 'codex')?.sessions ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Header refreshedAt={data?.refreshedAt ?? null} isRefreshing={refreshing} onRefresh={() => fetchData(true)} />
        <PageTabs />

        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Detailed Statistics</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500">Measured local telemetry, grouped in Dubai time. Monetary values are estimates—not subscription charges.</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Statistics filters">
            <div className="flex rounded-lg border border-[#1e1e2e] bg-[#111118] p-1">
              {(['all', 'claude', 'codex'] as const).map((value) => <button key={value} onClick={() => setProvider(value)} aria-pressed={provider === value} className={`min-h-9 rounded-md px-3 text-[11px] font-medium capitalize transition-colors ${provider === value ? 'bg-[#242433] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{value}</button>)}
            </div>
            <div className="flex rounded-lg border border-[#1e1e2e] bg-[#111118] p-1">
              {[1, 7, 30, 90].map((value) => <button key={value} onClick={() => setDays(value)} aria-pressed={days === value} className={`min-h-9 rounded-md px-3 text-[11px] font-medium transition-colors ${days === value ? 'bg-[#242433] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{value}d</button>)}
            </div>
          </div>
        </div>

        {error && <div role="alert" className="mt-5 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-[13px] text-red-400">{error}</div>}
        {loading ? <Skeleton /> : data && (
          <>
            <section aria-label="Usage summary" className="mt-6 grid overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118] sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Total tokens" value={tokenFormatter.format(data.summary.totalTokens)} detail={fullNumber.format(data.summary.totalTokens)} icon={Layers3} />
              <Metric label="Sessions" value={fullNumber.format(data.summary.sessions)} detail={`${data.summary.activeDays} active days`} icon={MessagesSquare} />
              <Metric label="Average / session" value={tokenFormatter.format(data.summary.averageTokensPerSession)} detail="Measured tokens" icon={Gauge} />
              <Metric label="API-equivalent" value={costLabel} detail={`${data.dataQuality.apiEquivalentSessions}/${data.summary.sessions} priced sessions · not billed`} icon={CircleDollarSign} />
              <Metric label="Estimated Codex credits used" value={data.summary.codexCredits === null ? 'Unavailable' : data.summary.codexCredits.toFixed(1)} detail={codexSessions ? `${data.dataQuality.codexCreditSessions}/${codexSessions} Codex sessions · not remaining balance` : 'Codex sessions only · not remaining balance'} icon={Activity} />
              <Metric label="Coverage" value={`${data.dataQuality.measuredSessions}/${data.summary.sessions}`} detail="Fully measured sessions" icon={CalendarDays} />
            </section>

            <div className="mt-6 flex w-fit rounded-lg border border-[#1e1e2e] bg-[#111118] p-1" aria-label="Statistics sub-tabs">
              {(['tokens', 'behaviour', 'quality'] as const).map((tab) => <button key={tab} onClick={() => setSubTab(tab)} aria-pressed={subTab === tab} className={`min-h-9 rounded-md px-4 text-[11px] font-medium capitalize transition-colors ${subTab === tab ? 'bg-[#242433] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{tab === 'tokens' ? 'Tokens & Cost' : tab}</button>)}
            </div>

            {subTab === 'tokens' && (
              <>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <div className="mb-5 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-slate-200">Token activity</h3><p className="mt-1 text-[11px] text-slate-600">Daily token composition</p></div><span className="font-mono text-[10px] text-slate-600">Asia/Dubai</span></div>
                    <div className="h-72" role="img" aria-label="Daily stacked token activity chart">
                      <ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{ left: -20, right: 4 }}><defs><linearGradient id="inputFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35}/><stop offset="100%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#1e1e2e" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24}/><YAxis tickFormatter={(value) => tokenFormatter.format(value)} tickLine={false} axisLine={false}/><Tooltip content={<ChartTooltip />}/><Legend wrapperStyle={{ fontSize: 10, color: '#64748b' }}/><Area type="monotone" stackId="tokens" dataKey="input" name="Input" stroke="#10b981" fill="url(#inputFill)"/><Area type="monotone" stackId="tokens" dataKey="cached" name="Cached" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.15}/><Area type="monotone" stackId="tokens" dataKey="output" name="Output" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.18}/><Area type="monotone" stackId="tokens" dataKey="reasoning" name="Reasoning" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12}/></AreaChart></ResponsiveContainer>
                    </div>
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Provider share</h3><p className="mt-1 text-[11px] text-slate-600">Tokens by source</p>
                    <div className="mt-5 h-72" role="img" aria-label="Provider token comparison chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.providers} layout="vertical" margin={{ left: 2, right: 10 }}><CartesianGrid stroke="#1e1e2e" horizontal={false}/><XAxis type="number" tickFormatter={(value) => tokenFormatter.format(value)} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={52} tickLine={false} axisLine={false}/><Tooltip content={<ChartTooltip />}/><Bar dataKey="tokens" name="Tokens" fill="#10b981" radius={[0, 3, 3, 0]} maxBarSize={28}/></BarChart></ResponsiveContainer></div>
                  </section>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Projects</h3><p className="mt-1 text-[11px] text-slate-600">Where measured tokens were used</p>
                    <div className="mt-4 space-y-3">{data.projects.slice(0, 7).map((item) => { const share = data.summary.totalTokens ? item.tokens / data.summary.totalTokens : 0; return <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-4"><span className="truncate text-[11px] text-slate-400" title={item.name}>{item.name}</span><span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-600">{tokenFormatter.format(item.tokens)} · {item.sessions}</span></div><div className="h-1 overflow-hidden rounded-full bg-[#1e1e2e]"><div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.max(1, share * 100)}%` }} /></div></div>; })}{!data.projects.length && <p className="py-8 text-center text-[11px] text-slate-600">No project metadata available.</p>}</div>
                  </section>
                  <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Models</h3><p className="mt-1 text-[11px] text-slate-600">Usage by recorded model identifier</p>
                    <div className="mt-4 divide-y divide-[#1e1e2e]">{data.models.slice(0, 8).map((item) => <div key={`${item.provider}:${item.name}`} className="flex items-center justify-between gap-4 py-2.5"><div className="min-w-0"><p className="truncate font-mono text-[11px] text-slate-300" title={item.name}>{item.name}</p><p className="mt-0.5 text-[9px] capitalize text-slate-700">{item.provider}</p></div><div className="shrink-0 text-right"><p className="font-mono text-[11px] tabular-nums text-slate-400">{tokenFormatter.format(item.tokens)}</p><p className="mt-0.5 text-[9px] text-slate-700">{item.sessions} sessions</p></div></div>)}{!data.models.length && <p className="py-8 text-center text-[11px] text-slate-600">No model metadata available.</p>}</div>
                  </section>
                  <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Cache writes</h3><p className="mt-1 text-[11px] text-slate-600">5-minute vs 1-hour TTL</p>
                    {data.cacheWriteSplit.fiveMinute + data.cacheWriteSplit.oneHour > 0 ? (
                      <div className="mt-4 divide-y divide-[#1e1e2e]">
                        <EfficiencyItem label="5-minute writes" value={tokenFormatter.format(data.cacheWriteSplit.fiveMinute)} detail="Cheaper, standard ephemeral cache" />
                        <EfficiencyItem label="1-hour writes" value={tokenFormatter.format(data.cacheWriteSplit.oneHour)} detail="2x write cost, longer-lived cache" />
                      </div>
                    ) : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                </div>
              </>
            )}

            {subTab === 'behaviour' && (
              <>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Tool mix</h3><p className="mt-1 text-[11px] text-slate-600">Top tools by call count</p>
                    {data.toolMix.length ? (
                      <div className="mt-5 h-64" role="img" aria-label="Tool call breakdown chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.toolMix} layout="vertical" margin={{ left: 2, right: 10 }}><CartesianGrid stroke="#1e1e2e" horizontal={false}/><XAxis type="number" tickFormatter={(value) => tokenFormatter.format(value)} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/><Tooltip content={<ChartTooltip />}/><Bar dataKey="count" name="Calls" fill="#10b981" radius={[0, 3, 3, 0]} maxBarSize={16}/></BarChart></ResponsiveContainer></div>
                    ) : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Main thread vs subagents</h3><p className="mt-1 text-[11px] text-slate-600">Token split by thread type</p>
                    {data.threadSplit.mainTokens + data.threadSplit.subagentTokens > 0 ? (
                      <div className="mt-5"><RankedList items={[{ name: 'Main thread', value: data.threadSplit.mainTokens }, { name: 'Subagents', value: data.threadSplit.subagentTokens }]} total={data.threadSplit.mainTokens + data.threadSplit.subagentTokens} formatValue={(value) => tokenFormatter.format(value)} /></div>
                    ) : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-[13px] font-semibold text-slate-200">Activity pattern</h3><p className="mt-1 text-[11px] text-slate-600">Tokens by weekday and hour</p></div><span className="font-mono text-[10px] text-slate-600">Dubai time</span></div>
                    <ActivityHeatmap values={data.heatmap} />
                    <div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-slate-700"><span>Less</span>{[0.08, 0.22, 0.45, 0.7, 1].map((opacity) => <span key={opacity} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: `rgba(16,185,129,${opacity})` }} />)}<span>More</span></div>
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Entrypoint & effort</h3><p className="mt-1 text-[11px] text-slate-600">Sessions by launch surface and reasoning effort</p>
                    {data.entrypoints.length || data.effortLevels.length ? (
                      <div className="mt-5 space-y-5">
                        <RankedList items={data.entrypoints.map((item) => ({ name: item.name, value: item.sessions }))} total={data.entrypoints.reduce((sum, item) => sum + item.sessions, 0)} formatValue={(value) => `${value} sessions`} />
                        <RankedList items={data.effortLevels.map((item) => ({ name: item.name, value: item.sessions }))} total={data.effortLevels.reduce((sum, item) => sum + item.sessions, 0)} formatValue={(value) => `${value} sessions`} />
                      </div>
                    ) : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                </div>
              </>
            )}

            {subTab === 'quality' && (
              <>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(250px,0.65fr)_minmax(0,1.35fr)]">
                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Efficiency & performance</h3>
                    <p className="mt-1 text-[11px] text-slate-600">How effectively context and time are used</p>
                    <div className="mt-5 divide-y divide-[#1e1e2e]">
                      <EfficiencyItem label="Cache hit ratio" value={formatPercent(data.summary.cacheHitRatio, 1)} detail="Cached tokens as a share of reusable input" />
                      <EfficiencyItem label="Output / input" value={formatPercent(data.summary.outputInputRatio, 1)} detail="Generated output relative to total prompt context" />
                      <EfficiencyItem label="Context utilization" value={formatPercent(data.summary.averageContextUtilization, 1)} detail="Average peak session context versus model window" />
                      <EfficiencyItem label="Average session" value={formatDuration(data.summary.averageDurationMs)} detail={`${data.summary.compactions} compactions in the selected range`} />
                      <EfficiencyItem label="Time to first token" value={formatDuration(data.summary.averageTimeToFirstTokenMs)} detail="Codex task-completion telemetry where available" />
                    </div>
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Stop reasons</h3><p className="mt-1 text-[11px] text-slate-600">Why turns ended{data.stopReasons.some((item) => item.name === 'max_tokens') ? ' — max_tokens truncations highlighted' : ''}</p>
                    {data.stopReasons.length ? (
                      <div className="mt-5 space-y-3">{data.stopReasons.map((item) => { const total = data.stopReasons.reduce((sum, i) => sum + i.count, 0); const share = total ? item.count / total : 0; const isTruncation = item.name === 'max_tokens'; return <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-4"><span className={`truncate font-mono text-[11px] ${isTruncation ? 'text-amber-400' : 'text-slate-400'}`}>{item.name}</span><span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-600">{fullNumber.format(item.count)}</span></div><div className="h-1 overflow-hidden rounded-full bg-[#1e1e2e]"><div className={`h-full rounded-full ${isTruncation ? 'bg-amber-500/70' : 'bg-emerald-500/70'}`} style={{ width: `${Math.max(1, share * 100)}%` }} /></div></div>; })}</div>
                    ) : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">Fast mode vs standard</h3><p className="mt-1 text-[11px] text-slate-600">Requests by service speed</p>
                    {data.speeds.length ? <div className="mt-4"><RankedList items={data.speeds.map((item) => ({ name: item.name, value: item.count }))} total={data.speeds.reduce((sum, item) => sum + item.count, 0)} formatValue={(value) => fullNumber.format(value)} /></div> : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                  <section className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 sm:p-5">
                    <h3 className="text-[13px] font-semibold text-slate-200">CC version cohorts</h3><p className="mt-1 text-[11px] text-slate-600">Sessions by Claude Code version</p>
                    {data.ccVersions.length ? <div className="mt-4"><RankedList items={data.ccVersions.slice(0, 8).map((item) => ({ name: item.name, value: item.sessions }))} total={data.ccVersions.reduce((sum, item) => sum + item.sessions, 0)} formatValue={(value) => `${value} sessions`} /></div> : <EmptyPanelState legacySessions={data.dataQuality.legacySessions} />}
                  </section>
                </div>
              </>
            )}

            <section className="mt-4 overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118]">
              <div className="flex items-start justify-between gap-4 border-b border-[#1e1e2e] px-4 py-4 sm:px-5"><div><h3 className="text-[13px] font-semibold text-slate-200">Session explorer</h3><p className="mt-1 text-[11px] text-slate-600">Telemetry only—conversation content is never included</p></div><span className="font-mono text-[10px] text-slate-700">Latest {Math.min(sessionLimit, data.sessions.length)} of {data.sessions.length}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead><tr className="border-b border-[#1e1e2e] text-[9px] font-medium text-slate-600"><th className="px-5 py-3">Started</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Project</th><th className="px-3 py-3">Model</th><th className="px-3 py-3 text-right">Tokens</th><th className="px-3 py-3 text-right">Cached</th><th className="px-3 py-3 text-right">Duration</th><th className="px-5 py-3 text-right">Estimate</th></tr></thead>
                  <tbody>{data.sessions.slice(0, sessionLimit).map((session) => <tr key={session.id} className="border-b border-[#1e1e2e]/70 text-[10px] text-slate-500 last:border-b-0 hover:bg-[#16161f]"><td className="whitespace-nowrap px-5 py-3 font-mono">{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(session.timestamp))}</td><td className="px-3 py-3 capitalize"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] ${session.provider === 'claude' ? 'bg-violet-500/10 text-violet-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{session.provider}</span></td><td className="max-w-40 truncate px-3 py-3 text-slate-400" title={session.project}>{session.project}</td><td className="max-w-44 truncate px-3 py-3 font-mono" title={session.model}>{session.model}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">{tokenFormatter.format(session.totalTokens)}</td><td className="px-3 py-3 text-right font-mono tabular-nums">{formatPercent(session.totalTokens ? session.cachedTokens / session.totalTokens : null)}</td><td className="px-3 py-3 text-right font-mono tabular-nums">{formatDuration(session.durationMs)}</td><td className="px-5 py-3 text-right font-mono tabular-nums"><span className="block">{session.apiEquivalentCost !== null ? `$${session.apiEquivalentCost.toFixed(2)} API eq.` : '—'}</span>{session.codexCredits !== null && <span className="mt-0.5 block text-slate-700">{session.codexCredits.toFixed(1)} cr</span>}</td></tr>)}</tbody>
                </table>
              </div>
              {sessionLimit < data.sessions.length && <div className="border-t border-[#1e1e2e] p-3 text-center"><button onClick={() => setSessionLimit((limit) => Math.min(limit + 10, data.sessions.length))} className="min-h-11 rounded-lg px-4 text-[11px] font-medium text-slate-500 hover:bg-[#16161f] hover:text-slate-300">Show 10 more</button></div>}
            </section>

            <div className="mt-4 flex items-center justify-between text-[10px] text-slate-700"><span>{data.dataQuality.partialSessions ? `${data.dataQuality.partialSessions} legacy sessions contain partial detail` : 'All sessions contain detailed telemetry'}</span><button onClick={() => fetchData(true)} className="flex min-h-11 items-center gap-1.5 px-2 text-slate-600 hover:text-slate-400"><RefreshCw className="h-3 w-3"/>Refresh data</button></div>
          </>
        )}
      </div>
    </div>
  );
}
