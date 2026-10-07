// tests/propose-local.test.mjs — the NEURAL PROPOSER's pure, deterministic helpers (the LLM call itself is
// ungraded, non-deterministic tooling and is not tested here). We test only parse + compile: that the model's
// output is read safely and compiled into a warm-start genome the gate can then accept or reject. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHypotheses, hypothesesToGenome } from '../tools/propose-local.mjs';
import { MAXRULES } from '../vendor/seed-library/seedlib.mjs';

const FEATS = ['amount', 'hourOfDay', 'distanceKm', 'recentTx', 'merchantRisk', 'cardNotPresent'];

test('parseHypotheses: strict JSON is read, unknown features are dropped, directions normalised', () => {
  const h = parseHypotheses('[{"feature":"amount","direction":"high"},{"feature":"distanceKm","direction":"LOW"},{"feature":"ghost","direction":"high"}]', FEATS);
  assert.deepEqual(h, [{ feature: 'amount', direction: 'high' }, { feature: 'distanceKm', direction: 'low' }]);
});

test('parseHypotheses: tolerant fallback scans prose when JSON is absent', () => {
  const h = parseHypotheses('I think amount tends to be high and merchantRisk is often low for fraud.', FEATS);
  const byFeat = Object.fromEntries(h.map((x) => [x.feature, x.direction]));
  assert.equal(byFeat.amount, 'high');
  assert.equal(byFeat.merchantRisk, 'low');
});

test('parseHypotheses: garbage yields no hypotheses, never throws', () => {
  assert.deepEqual(parseHypotheses('', FEATS), []);
  assert.deepEqual(parseHypotheses('{not json at all', FEATS), []);
  assert.ok(Array.isArray(parseHypotheses(null, FEATS)));
});

test('parseHypotheses: never returns more than MAXRULES', () => {
  const many = FEATS.concat(FEATS).map((f) => ({ feature: f, direction: 'high' }));
  assert.ok(parseHypotheses(JSON.stringify(many), FEATS).length <= MAXRULES);
});

test('hypothesesToGenome: sets one rule per hypothesis with the right side, empty -> stem', () => {
  const g = hypothesesToGenome([{ feature: 'amount', direction: 'high' }, { feature: 'hourOfDay', direction: 'low' }], FEATS);
  assert.equal(g.on & 1, 1, 'rule 0 on');
  assert.equal(g.on & 2, 2, 'rule 1 on');
  assert.equal(g.f0, FEATS.indexOf('amount'));
  assert.equal(g.d0, 1, 'high -> > side');
  assert.equal(g.f1, FEATS.indexOf('hourOfDay'));
  assert.equal(g.d1, 0, 'low -> <= side');
  const stem = hypothesesToGenome([], FEATS);           // no hypotheses -> the neutral stem (all rules on)
  assert.equal(stem.on, (1 << MAXRULES) - 1);
});
