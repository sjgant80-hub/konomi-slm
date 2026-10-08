// tests/sleep.test.mjs — SLEEP: the fold-cycle must COMPRESS redundancy, REFUSE a fold that loses recall, and NEVER
// drop recall below where it started (it can forget nothing to save space). Deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluster, consolidate, recall, queriesFor, sleepFold } from '../tools/sleep.mjs';

const redundant = [
  { id: 'a1', text: 'the gate keeps verified patterns that predict held-out cases it never saw' },
  { id: 'a2', text: 'the gate keeps verified patterns that predict held-out cases it never saw as well' },
  { id: 'a3', text: 'verified patterns the gate keeps predict held-out cases it never saw here' },
];
const distinct = [
  { id: 'fin', text: 'loan default rises with debt to income ratio and credit utilisation delinquencies' },
  { id: 'med', text: 'triage marks a patient critical when oxygen saturation falls and respiratory rate climbs' },
  { id: 'net', text: 'network intrusion shows failed logins across many distinct ports off hours' },
];

test('recall: all queries present -> 1, a missing query -> below 1', () => {
  assert.equal(recall(redundant, ['held-out', 'verified']), 1);
  assert.ok(recall(redundant, ['held-out', 'xylophone']) < 1);
  assert.equal(recall([], ['anything']), 0);
});

test('consolidate: shorter than the sum and keeps every source id (provenance)', () => {
  const d = consolidate(redundant, 0.5);
  assert.ok(d.dream === true);
  assert.deepEqual(d.from, ['a1', 'a2', 'a3']);
  assert.ok(d.text.length < redundant.reduce((n, r) => n + r.text.length, 0));
  for (const id of ['a1', 'a2', 'a3']) assert.ok(d.text.includes(id));
});

test('cluster: groups the redundant restatements, keeps distinct memories apart', () => {
  const g = cluster(redundant, 0.4);
  assert.equal(g.length, 1, 'three restatements -> one cluster');
  const g2 = cluster(distinct, 0.4);
  assert.equal(g2.length, 3, 'three distinct memories -> three clusters');
});

test('sleepFold COMPRESSES a redundant stream with recall held', () => {
  const r = sleepFold(redundant, { threshold: 0.4, minShare: 0.5 });
  assert.ok(r.receipt.memoriesOut < r.receipt.memoriesIn, 'the redundant cluster folded');
  assert.ok(r.receipt.bytesOut < r.receipt.bytesIn, 'and the journal shrank');
  assert.equal(r.receipt.recallHeld, true);
  assert.ok(r.receipt.recallAfter >= r.receipt.recallBefore);
});

test('sleepFold REFUSES to fold distinct memories (nothing to compress, nothing lost)', () => {
  const r = sleepFold(distinct, { threshold: 0.4, minShare: 0.5 });
  assert.equal(r.receipt.memoriesOut, r.receipt.memoriesIn, 'distinct memories are all kept');
  assert.equal(r.receipt.recallAfter, r.receipt.recallBefore);
});

test('THE INVARIANT: sleep never drops recall below where it started, on any mix', () => {
  const r = sleepFold(redundant.concat(distinct), { threshold: 0.4, minShare: 0.5 });
  assert.ok(r.receipt.recallAfter >= r.receipt.recallBefore, 'sleep forgets nothing to save space');
  // deterministic
  const r2 = sleepFold(redundant.concat(distinct), { threshold: 0.4, minShare: 0.5 });
  assert.equal(r2.receipt.bytesOut, r.receipt.bytesOut);
  assert.equal(r2.receipt.memoriesOut, r.receipt.memoriesOut);
});
