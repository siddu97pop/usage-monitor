import assert from 'node:assert/strict';
import { normalizeRateLimitResponse, normalizeRateLimitSnapshot } from './codex-rate-limits.mjs';

const current = normalizeRateLimitResponse({
  result: {
    rateLimitsByLimitId: {
      codex: {
        planType: 'plus',
        primary: { usedPercent: 22, windowDurationMins: 10_080, resetsAt: 2_000_000_000 },
        secondary: null,
      },
    },
  },
}, '2026-07-21T00:00:00.000Z');

assert.equal(current.primary, null);
assert.deepEqual(current.secondary, {
  used_percent: 22,
  window_minutes: 10_080,
  resets_at: 2_000_000_000,
});
assert.equal(current.plan_type, 'plus');

const legacy = normalizeRateLimitSnapshot({
  plan_type: 'plus',
  primary: { used_percent: 51, window_minutes: 300, resets_at: 1_900_000_000 },
  secondary: { used_percent: 8, window_minutes: 10_080, resets_at: 2_000_000_000 },
});

assert.equal(legacy.primary.used_percent, 51);
assert.equal(legacy.secondary.used_percent, 8);
assert.equal(normalizeRateLimitSnapshot({ primary: null, secondary: null }), null);

console.log('Codex rate-limit normalization checks passed.');
