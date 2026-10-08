// tests/synapses.test.mjs — the synapse layer: term vectors, weighted graph, Hebbian strengthen/weaken, dream-gate prune.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termVector, cosine, buildSynapses, hebbianUpdate, prune } from '../tools/synapses.mjs';

test('termVector keeps significant terms, drops stopwords and short words', () => {
  const v = termVector('when PageValues is above 0 the visitor makes a purchase likely');
  assert.ok(v.pagevalues >= 1);
  assert.ok(v.visitor >= 1 && v.purchase >= 1);
  assert.equal(v.when, undefined); assert.equal(v.makes, undefined); assert.equal(v.the, undefined);
});

test('cosine: 1 on identical, 0 on disjoint, symmetric', () => {
  const a = termVector('observation evidence perception experiment'), b = termVector('observation evidence perception experiment');
  assert.equal(cosine(a, b), 1);
  assert.equal(cosine(termVector('reason innate deduction'), termVector('turbidity chlorine ecoli')), 0);
  const x = termVector('alpha beta beta'), y = termVector('beta gamma');
  assert.equal(cosine(x, y), cosine(y, x));
});

test('buildSynapses: symmetric-free undirected edges, same-field outweighs same-family, weights in [0,1]', () => {
  const organs = [
    { domain: 'credit', field: 'finance', family: 'money', book: 'default dti utilisation delinquencies' },
    { domain: 'fraud', field: 'finance', family: 'money', book: 'fraud merchant risk amount distance' },
    { domain: 'shopper', field: 'commerce', family: 'money', book: 'purchase pagevalues bounce administrative' },
    { domain: 'triage', field: 'medical', family: 'care', book: 'critical spo2 respiratory heart' },
  ];
  const g = buildSynapses(organs);
  assert.equal(g.edges.length, 6);                                     // 4 choose 2
  for (const e of g.edges) assert.ok(e.w >= 0 && e.w <= 1);
  const cf = g.edges.find((e) => e.a === 'credit' && e.b === 'fraud');  // same field
  const cs = g.edges.find((e) => e.a === 'credit' && e.b === 'shopper');// same family, different field
  const ct = g.edges.find((e) => e.a === 'credit' && e.b === 'triage'); // different family
  assert.ok(cf.w > cs.w, 'same field is a stronger synapse than same family');
  assert.ok(cs.w > ct.w, 'same family is a stronger synapse than unrelated');
});

test('hebbianUpdate: co-success strengthens, co-failure weakens, clamps, adds a missing link', () => {
  const g = { nodes: [], edges: [{ a: 'x', b: 'y', w: 0.5 }] };
  hebbianUpdate(g, { a: 'x', b: 'y', success: true, rate: 0.2 });
  assert.equal(g.edges[0].w, 0.7);
  hebbianUpdate(g, { a: 'y', b: 'x', success: false, rate: 0.2 });     // order-independent
  assert.equal(g.edges[0].w, 0.5);
  for (let i = 0; i < 20; i++) hebbianUpdate(g, { a: 'x', b: 'y', success: true });
  assert.ok(g.edges[0].w <= 1, 'clamped at 1');
  hebbianUpdate(g, { a: 'p', b: 'q', success: true, rate: 0.3 });
  assert.ok(g.edges.find((e) => e.a === 'p' && e.b === 'q'), 'a co-success creates a new synapse');
});

test('prune (dream-gate): cuts links below the floor, keeps the rest sorted strongest-first', () => {
  const g = { nodes: [], edges: [{ a: 'a', b: 'b', w: 0.4 }, { a: 'a', b: 'c', w: 0.1 }, { a: 'b', b: 'c', w: 0.6 }] };
  const p = prune(g, 0.15);
  assert.equal(p.edges.length, 2);
  assert.equal(p.edges[0].w, 0.6);
  assert.ok(!p.edges.some((e) => e.w < 0.15));
});
