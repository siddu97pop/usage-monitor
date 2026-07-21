import { spawn } from 'node:child_process';

function normalizeWindow(window) {
  if (!window || typeof window !== 'object') return null;

  const usedPercent = Number(window.usedPercent ?? window.used_percent);
  const windowMinutes = Number(window.windowDurationMins ?? window.window_minutes);
  const resetsAt = Number(window.resetsAt ?? window.resets_at);
  if (!Number.isFinite(usedPercent) || !Number.isFinite(windowMinutes)) return null;

  return {
    used_percent: usedPercent,
    window_minutes: windowMinutes,
    resets_at: Number.isFinite(resetsAt) ? resetsAt : 0,
  };
}

export function normalizeRateLimitSnapshot(snapshot, observedAt = new Date().toISOString()) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const windows = [snapshot.primary, snapshot.secondary]
    .map(normalizeWindow)
    .filter(Boolean);
  if (!windows.length) return null;

  // The app-server protocol no longer guarantees that `primary` means 5-hour
  // and `secondary` means 7-day. Match the windows by their actual duration.
  const fiveHour = windows.find((window) => window.window_minutes === 300) ?? null;
  const sevenDay = windows.find((window) => window.window_minutes === 10_080) ?? null;

  return {
    primary: fiveHour,
    secondary: sevenDay,
    plan_type: snapshot.planType ?? snapshot.plan_type ?? null,
    source_file: 'codex-app-server',
    observed_at: observedAt,
  };
}

export function normalizeRateLimitResponse(response, observedAt = new Date().toISOString()) {
  const result = response?.result ?? response;
  const snapshot = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  return normalizeRateLimitSnapshot(snapshot, observedAt);
}

export function readCodexRateLimits({ command = process.env.CODEX_BIN ?? 'codex', timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };

    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const timer = setTimeout(
      () => finish(new Error(`Codex rate-limit request timed out after ${timeoutMs}ms${stderr ? `: ${stderr.trim()}` : ''}`)),
      timeoutMs,
    );

    child.on('error', (error) => finish(error));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          if (message.id === 0) {
            if (message.error) {
              finish(new Error(`Codex app-server initialization failed: ${JSON.stringify(message.error)}`));
              return;
            }
            send({ method: 'initialized', params: {} });
            send({ method: 'account/rateLimits/read', id: 1, params: null });
          } else if (message.id === 1) {
            if (message.error) {
              finish(new Error(`Codex rate-limit request failed: ${JSON.stringify(message.error)}`));
              return;
            }
            const normalized = normalizeRateLimitResponse(message);
            if (!normalized) {
              finish(new Error('Codex returned no recognized rate-limit windows.'));
              return;
            }
            finish(null, normalized);
          }
        } catch {
          // Ignore non-JSON diagnostic output.
        }
      }
    });
    child.on('exit', (code) => {
      if (!settled) finish(new Error(`Codex app-server exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'usage_monitor',
          title: 'LexiTools Usage Monitor',
          version: '0.1.0',
        },
      },
    });
  });
}
