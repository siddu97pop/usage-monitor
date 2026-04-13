'use client';

import { RefreshCw, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  refreshedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function Header({
  refreshedAt,
  isRefreshing,
  onRefresh,
}: HeaderProps) {
  const timeAgo = refreshedAt
    ? formatDistanceToNow(new Date(refreshedAt), { addSuffix: true })
    : null;

  return (
    <header className="flex items-center justify-between">
      {/* Left: title */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111118] border border-[#1e1e2e]">
          <Activity className="h-4 w-4 text-slate-400" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-100">
            LexiTools{' '}
            <span className="text-slate-400 font-normal">/ Usage Monitor</span>
          </h1>
          {timeAgo && (
            <p className="text-[11px] text-slate-500">
              Updated {timeAgo}
            </p>
          )}
        </div>
      </div>

      {/* Right: refresh */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="Refresh usage data"
        className="flex items-center gap-2 rounded-lg border border-[#1e1e2e] bg-[#111118] px-3 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin-slow' : ''}`}
        />
        <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </header>
  );
}
