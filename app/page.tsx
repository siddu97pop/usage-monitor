'use client';

import { useEffect, useState, useCallback } from 'react';
import Header from '@/components/Header';
import ProviderCard from '@/components/ProviderCard';
import type { UsageResponse } from '@/types/usage';

// ─── Skeleton card ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 animate-pulse">
      <div className="flex justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-[#1e1e2e]" />
          <div className="h-2.5 w-16 rounded bg-[#1e1e2e]" />
        </div>
        <div className="h-3 w-10 rounded bg-[#1e1e2e]" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-2 w-20 rounded bg-[#1e1e2e]" />
        <div className="h-16 w-full rounded bg-[#1e1e2e]" />
        <div className="h-2 w-20 rounded bg-[#1e1e2e]" />
        <div className="h-16 w-full rounded bg-[#1e1e2e]" />
      </div>
      <div className="border-t border-[#1e1e2e]" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-2 w-12 rounded bg-[#1e1e2e]" />
            <div className="h-4 w-16 rounded bg-[#1e1e2e]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    } catch (err) {
      setError('Failed to load usage data. Retrying on next refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <Header
        refreshedAt={data?.refreshedAt ?? null}
        isRefreshing={refreshing}
        onRefresh={() => fetchData(true)}
      />

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Cards grid */}
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
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

      {/* Footer note */}
      <p className="mt-8 text-center text-[11px] text-slate-600">
        Codex and Claude reflect subscription-based usage — not API billing.
        Data may be approximated or manually imported.
      </p>
    </div>
  );
}
