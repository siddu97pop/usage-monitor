'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Overview' },
  { href: '/statistics', label: 'Detailed Statistics' },
];

export default function PageTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Usage monitor views" className="mt-5 border-b border-[#1e1e2e]">
      <div className="flex gap-5">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-11 items-center text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
                active ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {active && <span className="absolute inset-x-0 -bottom-px h-px bg-emerald-400" aria-hidden="true" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
