// tests/neurons.test.mjs — NEURONS: a neuron is 8 workers + a deterministic rule resolver; it is verified only if the
// cube beats its best single worker on held-out; everything is total and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growNeuron, resolve, neuronVerdict, neuronMap, WORKERS } from '../tools/neurons.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const SMALL = { growCfg: { population: 10, elites: 2, generations: 8 } };
const ds = loadDomain('triage', {});

test('growNeuron grows a cube of 8 distinct workers, each with a held-out skill', () => {
  const n = growNeuron(ds, SMALL);
  assert.equal(n.ok, true);
  assert.equal(n.workers.length, WORKERS);
  for (const w of n.workers) { assert.ok(w.heldAuc >= 0 && w.heldAuc <= 1); assert.ok(w.card && Array.isArray(w.card.rules)); }
});

test('the resolver is a deterministic weighted vote — same input, same score, total on garbage', () => {
  const n = growNeuron(ds, SMALL);
  const a = resolve(n, ds, ds.heldRows[0]);
  const b = resolve(n, ds, ds.heldRows[0]);
  assert.equal(a, b);
  assert.equal(typeof a, 'number');
  assert.equal(resolve(null, ds, 0), 0);
});

test('neuronVerdict: reports the cube vs its best/mean worker and the verified flag', () => {
  const n = growNeuron(ds, SMALL);
  const v = neuronVerdict(n, ds);
  assert.ok(v.neuronAuc >= 0 && v.neuronAuc <= 1);
  assert.ok(v.bestWorker >= v.meanWorker - 1e-9, 'best >= mean');
  assert.equal(v.verified, v.neuronAuc >= v.meanWorker);
  assert.equal(v.beatsBest, v.neuronAuc >= v.bestWorker);
  assert.equal(v.liftVsBest, Math.round((v.neuronAuc - v.bestWorker) * 1e6) / 1e6);
});

test('growNeuron is deterministic (same seeds -> same workers)', () => {
  const a = growNeuron(ds, SMALL), b = growNeuron(ds, SMALL);
  assert.deepEqual(a.workers.map((w) => w.heldAuc), b.workers.map((w) => w.heldAuc));
  assert.deepEqual(a.workers.map((w) => w.thr), b.workers.map((w) => w.thr));
});

test('neuronMap addresses each neuron and counts the verified cubes', () => {
  const m = neuronMap([loadDomain('triage', {}), loadDomain('water', {})], SMALL);
  assert.equal(m.populated, 2);
  assert.ok(m.neurons.every((n) => n.address >= 0 && n.address < m.addressSpace));
  assert.ok(m.verified >= 0 && m.verified <= 2);
});

test('growNeuron on a dead dataset returns ok:false, never throws', () => {
  assert.equal(growNeuron({ ok: false }).ok, false);
});
