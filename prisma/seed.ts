import { PrismaClient } from '@prisma/client';
import { subDays, subHours, startOfHour } from 'date-fns';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4));
}

// ─── Provider seed config ─────────────────────────────────────────────────────

const providers = [
  {
    id: 'codex',
    source_type: 'subscription',
    usage_unit: 'messages',
    model_name: 'codex-1',
    // Codex (ChatGPT) — message counts per hour (moderate usage)
    hourlyRange: [0, 8] as [number, number],
    tokenRange: [800, 4000] as [number, number],
    costPerToken: 0.000002,
  },
  {
    id: 'claude',
    source_type: 'subscription',
    usage_unit: 'messages',
    model_name: 'claude-sonnet-4-6',
    // Claude — message counts (bursty, resets every 5h)
    hourlyRange: [0, 12] as [number, number],
    tokenRange: [1200, 8000] as [number, number],
    costPerToken: 0.000003,
  },
  {
    id: 'ollama',
    source_type: 'api',
    usage_unit: 'requests',
    model_name: 'llama3:8b',
    // Ollama — local + cloud requests (highest volume)
    hourlyRange: [0, 25] as [number, number],
    tokenRange: [500, 3000] as [number, number],
    costPerToken: 0.000001,
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding usage data...');

  // Clean slate
  await prisma.usageRecord.deleteMany();
  await prisma.syncLog.deleteMany();

  const now = new Date();
  const records: Parameters<typeof prisma.usageRecord.create>[0]['data'][] = [];

  for (const p of providers) {
    // Generate one record per hour for the last 7 days (168 hours)
    for (let h = 167; h >= 0; h--) {
      const timestamp = startOfHour(subHours(now, h));
      const usage_value = rand(...p.hourlyRange);

      // Skip some hours to make the chart look realistic (not every hour has usage)
      if (usage_value === 0 && Math.random() < 0.3) continue;

      const tokens = rand(...p.tokenRange) * usage_value || undefined;
      const estimated_cost = tokens
        ? parseFloat((tokens * p.costPerToken).toFixed(6))
        : undefined;

      records.push({
        provider: p.id,
        source_type: p.source_type,
        timestamp,
        usage_value,
        usage_unit: p.usage_unit,
        sync_status: 'synced',
        model_name: p.model_name,
        tokens: tokens || null,
        estimated_cost: estimated_cost || null,
        latency: randFloat(0.3, 4.2),
        status: 'success',
        raw_payload: {
          source: 'seed',
          hour: timestamp.getHours(),
        },
      });
    }

    // Add sync log entry per provider
    await prisma.syncLog.create({
      data: {
        provider: p.id,
        status: 'success',
        message: 'Initial seed data loaded',
      },
    });
  }

  // Batch insert
  await prisma.usageRecord.createMany({ data: records as any });

  console.log(`✅ Seeded ${records.length} records across ${providers.length} providers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
