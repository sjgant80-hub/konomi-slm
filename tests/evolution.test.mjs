// tests/evolution.test.mjs — EVOLUTION: the organ's feature-set evolves with held-out AUC as fitness; the evolved
// organ can never be worse than the all-features baseline (monotone), the fitness curve never descends, deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evolve, fitness, mutateConfig, crossConfig } from '../tools/evolution.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';

const ds = loadDomain('crop', {});
const SMALL = { generations: 4, population: 5, growCfg: { population: 10, elites: 2, generations: 8 } };

test('evolve never ships worse than the all-features baseline (monotone), curve never descends', () => {
  const e = evolve(ds, SMALL);
  assert.equal(e.ok, true);
  assert.ok(e.evolvedAuc >= e.baselineAuc - 1e-9, 'evolved >= baseline');
  for (let i = 1; i < e.curve.length; i++) assert.ok(e.curve[i] >= e.curve[i - 1] - 1e-9, 'fitness curve is non-decreasing');
  assert.ok(e.evolvedFeatures.length >= 2 && e.evolvedFeatures.length <= e.allFeatures);
  for (const f of e.evolvedFeatures) assert.ok(ds.features.includes(f), 'evolved features are a subset of the real ones');
});

test('evolve is deterministic — same dataset + config, same evolved organ', () => {
  const a = evolve(ds, SMALL), b = evolve(ds, SMALL);
  assert.equal(a.evolvedAuc, b.evolvedAuc);
  assert.deepEqual(a.evolvedFeatures, b.evolvedFeatures);
  assert.deepEqual(a.curve, b.curve);
});

test('fitness: AUC in [0,1], cache returns the same value', () => {
  const cache = new Map();
  const a = fitness(ds, ds.features.slice(0, 3), 7, SMALL.growCfg, cache);
  const b = fitness(ds, ds.features.slice(0, 3), 7, SMALL.growCfg, cache);
  assert.ok(a >= 0 && a <= 1);
  assert.equal(a, b);
});

test('mutateConfig / crossConfig keep >= 2 features, all within the real feature set', () => {
  const r = rng(3), all = ds.features;
  for (let i = 0; i < 20; i++) {
    const m = mutateConfig(all.slice(0, 3), all, r);
    assert.ok(m.length >= 2); for (const f of m) assert.ok(all.includes(f));
    const c = crossConfig(all.slice(0, 3), all.slice(2), r);
    assert.ok(c.length >= 2); for (const f of c) assert.ok(all.includes(f));
  }
});

test('evolve on a dead dataset returns ok:false, never throws', () => {
  assert.equal(evolve({ ok: false }).ok, false);
});
