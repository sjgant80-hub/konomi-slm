// tests/corpus.test.mjs — the corpus path's text front-end (deterministic parts). The forge itself is tested in
// patternforge.test.mjs; here we check that statements turn into a sane, deterministic marker-feature dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, generateStatements, CORPUS_IDS } from '../tools/corpus.mjs';

test('loadCorpus builds the forge dataset shape for each cited domain', () => {
  for (const d of CORPUS_IDS) {
    const ds = loadCorpus(d, { n: 400 });
    assert.equal(ds.ok, true);
    assert.ok(ds.features.length >= 8 && ds.features.length <= 16, 'marker vocab within the ribosome feature width');
    assert.equal(ds.y.length, ds.n);
    assert.ok(ds.y.every((v) => v === 0 || v === 1));
    assert.equal(new Set([...ds.trainRows, ...ds.heldRows]).size, ds.n, 'train and held partition every statement');
    for (const f of ds.features) assert.equal(ds.cols[f].length, ds.n);
    assert.ok(typeof ds.label1 === 'string' && ds.label1.length > 0);
  }
});

test('featurisation counts markers as non-negative integers and at least one fires', () => {
  const ds = loadCorpus('philosophy', { n: 300 });
  let totalFires = 0;
  for (const f of ds.features) for (let i = 0; i < ds.n; i++) {
    const v = ds.cols[f][i];
    assert.ok(Number.isInteger(v) && v >= 0, 'marker counts are non-negative integers');
    totalFires += v;
  }
  assert.ok(totalFires > 0, 'the vocabulary actually appears in the statements');
});

test('generation is deterministic (same seed -> same statements and labels)', () => {
  const a = generateStatements('science', 50, 2026);
  const b = generateStatements('science', 50, 2026);
  assert.deepEqual(a, b);
  const c = generateStatements('science', 50, 9999);
  assert.notDeepEqual(a, c, 'a different seed gives a different corpus');
});

test('loadCorpus is deterministic and both classes are present', () => {
  const a = loadCorpus('science', { n: 400 });
  const b = loadCorpus('science', { n: 400 });
  assert.deepEqual([...a.y], [...b.y]);
  const pos = [...a.y].filter((v) => v === 1).length;
  assert.ok(pos > 50 && pos < 350, 'both falsifiable and non-falsifiable statements occur');
});

test('unknown corpus domain returns ok:false, never throws', () => {
  assert.equal(loadCorpus('astrology').ok, false);
});
