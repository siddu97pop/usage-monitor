'use client';

import { useEffect, useState, useCallback } from 'react';
import Header from '@/components/Header';
import ProviderCard from '@/components/ProviderCard';
import PageTabs from '@/components/PageTabs';
import type { UsageResponse } from '@/types/usage';

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-28 rounded bg-[#1e1e2e]" />
          <div className="h-2.5 w-20 rounded bg-[#1e1e2e]" />
        </div>
        <div className="h-3 w-10 rounded bg-[#1e1e2e]" />
      </div>
      <div className="rounded-lg border border-[#1e1e2e] bg-[#0d0d14] p-4 flex flex-col gap-4">
        <div className="h-3 w-32 rounded bg-[#1e1e2e]" />
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <div className="h-3 w-24 rounded bg-[#1e1e2e]" />
            <div className="h-3 w-12 rounded bg-[#1e1e2e]" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#1e1e2e]" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <div className="h-3 w-24 rounded bg-[#1e1e2e]" />
            <div className="h-3 w-12 rounded bg-[#1e1e2e]" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#1e1e2e]" />
        </div>
      </div>
    </div>
  );
}

export default function UsagePage() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/usage', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: UsageResponse = await res.json();
      setData(json);
    } catch {
      setError('Failed to load usage data. Retrying on next refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">

        <Header
          refreshedAt={data?.refreshedAt ?? null}
          isRefreshing={refreshing}
          onRefresh={() => fetchData(true)}
        />

        <PageTabs />

        {error && (
          <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Cards — single column on mobile, 3 columns on lg */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : data ? (
            data.providers.map((p) => (
              <ProviderCard key={p.provider} stats={p} />
            ))
          ) : null}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-700">
          Codex and Claude reflect subscription plan limits — not API billing.
        </p>

      </div>
    </div>
  );
}
