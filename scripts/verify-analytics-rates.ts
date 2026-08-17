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
// v2 payloads only carry a flat cache_creation_tokens field, which now falls
// back to the 5m write rate (3.75, not the old flat 6 which was actually the
// 1h rate): 1e6*3 + 500k*0.3 + 250k*3.75 + 100k*15, all /1e6.
closeTo(claude.apiEquivalentCost, 5.5875);
assert.equal(claude.codexCredits, null);

// claude-opus-5: confirmed $5 input / $6.25 5m-write / $10 1h-write / $0.50 cache-read / $25 output
// per https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-08-17).
const opus5 = calculateEstimates('claude', 'claude-opus-5', {
  input_tokens: 1_000_000,
  cached_input_tokens: 200_000,
  cache_creation_5m_tokens: 100_000,
  cache_creation_1h_tokens: 50_000,
  output_tokens: 100_000,
});
// 1,000,000*5 + 200,000*0.5 + 100,000*6.25 + 50,000*10 + 100,000*25, all /1e6
closeTo(opus5.apiEquivalentCost, 5 + 0.1 + 0.625 + 0.5 + 2.5);

// 1h cache-write rate must differ from the 5m rate and must not be reused for it.
const opus5FiveMinuteOnly = calculateEstimates('claude', 'claude-opus-5', {
  input_tokens: 0,
  cache_creation_5m_tokens: 1_000_000,
});
closeTo(opus5FiveMinuteOnly.apiEquivalentCost, 6.25);
const opus5OneHourOnly = calculateEstimates('claude', 'claude-opus-5', {
  input_tokens: 0,
  cache_creation_1h_tokens: 1_000_000,
});
closeTo(opus5OneHourOnly.apiEquivalentCost, 10);
assert.notEqual(opus5FiveMinuteOnly.apiEquivalentCost, opus5OneHourOnly.apiEquivalentCost);

// Legacy payloads (v2, cache_creation_tokens only) still price via the 5m fallback.
const opus5Legacy = calculateEstimates('claude', 'claude-opus-5', {
  input_tokens: 0,
  cache_creation_tokens: 1_000_000,
});
closeTo(opus5Legacy.apiEquivalentCost, 6.25);

// reasoning_tokens is informational only — it must not be double-counted into
// cost or added on top of output_tokens (thinking tokens are already inside
// output_tokens in the raw payload).
const withReasoning = calculateEstimates('claude', 'claude-opus-5', {
  output_tokens: 100_000,
  reasoning_tokens: 40_000,
});
const withoutReasoning = calculateEstimates('claude', 'claude-opus-5', {
  output_tokens: 100_000,
});
closeTo(withReasoning.apiEquivalentCost as number, withoutReasoning.apiEquivalentCost as number);

console.log('Analytics rate checks passed.');
