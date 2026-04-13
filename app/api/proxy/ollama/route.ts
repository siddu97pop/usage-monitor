/**
 * Ollama Cloud proxy — POST /api/proxy/ollama
 *
 * Transparently forwards requests to https://ollama.com/api/chat or /api/generate,
 * then parses the token counts from non-streaming responses and stores them.
 *
 * Usage: point your Ollama client's base_url to this endpoint instead of
 * https://ollama.com — everything else stays the same.
 *
 * Supported endpoints forwarded:
 *   /api/chat     → https://ollama.com/api/chat
 *   /api/generate → https://ollama.com/api/generate
 *
 * The `endpoint` query param selects which one:
 *   POST /api/proxy/ollama?endpoint=chat
 *   POST /api/proxy/ollama?endpoint=generate   (default)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com';
const API_KEY  = process.env.OLLAMA_API_KEY ?? '';

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'OLLAMA_API_KEY not configured' }, { status: 500 });
  }

  const endpoint = req.nextUrl.searchParams.get('endpoint') ?? 'generate';
  if (!['chat', 'generate'].includes(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint param' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Force stream: false so we can capture the full response
  const forwardBody = { ...body, stream: false };

  const start = Date.now();

  try {
    const upstream = await fetch(`${BASE_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(forwardBody),
    });

    const latencyMs = Date.now() - start;
    const data = await upstream.json() as Record<string, unknown>;

    if (upstream.ok) {
      // Extract token counts from Ollama response
      const promptTokens  = (data.prompt_eval_count  as number | undefined) ?? 0;
      const outputTokens  = (data.eval_count          as number | undefined) ?? 0;
      const totalTokens   = promptTokens + outputTokens;
      const modelName     = (body.model as string | undefined) ?? 'unknown';

      // Persist to DB (best-effort — don't fail the response if DB is down)
      try {
        await prisma.usageRecord.create({
          data: {
            provider: 'ollama',
            source_type: 'proxy',
            timestamp: new Date(),
            usage_value: 1,          // 1 request
            usage_unit: 'requests',
            sync_status: 'synced',
            model_name: modelName,
            tokens: totalTokens || null,
            latency: latencyMs / 1000,
            status: 'success',
            raw_payload: {
              endpoint,
              prompt_eval_count: promptTokens,
              eval_count: outputTokens,
              total_duration: data.total_duration,
            },
          },
        });
      } catch {
        // DB not available — log is skipped but response still returns
      }
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach Ollama API', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
