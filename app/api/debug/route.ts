import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check env vars
  results.env = {
    DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0, 50) + '...' : 'MISSING',
    DIRECT_URL: process.env.DIRECT_URL ? process.env.DIRECT_URL.slice(0, 50) + '...' : 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Test Prisma
  try {
    const { prisma } = await import('@/lib/prisma');
    const count = await prisma.usageRecord.count();
    const rl = await prisma.syncLog.findFirst({ where: { provider: 'codex_rl' }, orderBy: { synced_at: 'desc' } });
    results.prisma = { ok: true, usageRecordCount: count, codexRlFound: !!rl, rlSyncedAt: rl?.synced_at };
  } catch (e: unknown) {
    results.prisma = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 3. Test getCodexUsage
  try {
    const { getCodexUsage } = await import('@/lib/codex-usage');
    const usage = await getCodexUsage();
    results.codexUsage = usage;
  } catch (e: unknown) {
    results.codexUsage = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
