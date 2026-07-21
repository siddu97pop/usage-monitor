import assert from 'node:assert/strict';
import { calculateEstimates } from '../lib/analytics';

function closeTo(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < 1e-9, `Expected ${expected}, received ${actual}`);
}

const shortContext = calculateEstimates('codex', 'gpt-5.4', {
  input_tokens: 1_000_000,
  cached_input_tokens: 600_000,
  output_tokens: 100_000,
  peak_input_tokens: 200_000,
});
closeTo(shortContext.codexCredits, 66.25);
closeTo(shortContext.apiEquivalentCost, 2.65);

const longContext = calculateEstimates('codex', 'gpt-5.4', {
  input_tokens: 1_000_000,
  cached_input_tokens: 600_000,
  output_tokens: 100_000,
  peak_input_tokens: 300_000,
});
closeTo(longContext.codexCredits, 66.25);
closeTo(longContext.apiEquivalentCost, 4.55);

const currentCreditRate = calculateEstimates('codex', 'gpt-5.6-sol', {
  input_tokens: 1_000_000,
});
closeTo(currentCreditRate.codexCredits, 125);
closeTo(currentCreditRate.apiEquivalentCost, 5);

assert.deepEqual(calculateEstimates('codex', 'unknown-model', { input_tokens: 1_000_000 }), {
  apiEquivalentCost: null,
  codexCredits: null,
});

const claude = calculateEstimates('claude', 'claude-sonnet-4-6', {
  input_tokens: 1_000_000,
  cached_input_tokens: 500_000,
  cache_creation_tokens: 250_000,
  output_tokens: 100_000,
});
closeTo(claude.apiEquivalentCost, 6.15);
assert.equal(claude.codexCredits, null);

console.log('Analytics rate checks passed.');
