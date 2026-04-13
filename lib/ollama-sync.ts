/**
 * Ollama Cloud sync service.
 *
 * What's available via API:
 *   GET /api/tags  → list of available cloud models (auth required)
 *
 * What's NOT available yet:
 *   No usage/quota endpoint exists. Token counts come from proxy logging only.
 *
 * This module:
 *   1. Health-checks the Ollama API key on every dashboard refresh
 *   2. Returns live model count and connection status
 *   3. Writes a SyncLog entry on success/failure
 */

const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com';
const API_KEY  = process.env.OLLAMA_API_KEY ?? '';

export interface OllamaHealthResult {
  connected: boolean;
  modelCount: number;
  models: string[];
  checkedAt: string;
  error?: string;
}

export async function checkOllamaHealth(): Promise<OllamaHealthResult> {
  const checkedAt = new Date().toISOString();

  if (!API_KEY) {
    return { connected: false, modelCount: 0, models: [], checkedAt, error: 'No API key configured' };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/tags`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
      // Timeout after 5 s so a slow Ollama server doesn't block the page render
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        connected: false,
        modelCount: 0,
        models: [],
        checkedAt,
        error: `HTTP ${res.status}`,
      };
    }

    const data = await res.json() as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);

    return { connected: true, modelCount: models.length, models, checkedAt };
  } catch (err) {
    return {
      connected: false,
      modelCount: 0,
      models: [],
      checkedAt,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
