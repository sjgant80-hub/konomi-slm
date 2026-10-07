// tests/grow-tier.test.mjs — the ladder's teeth. The growth engine must: never regress an existing domain
// (MONOTONE), only admit a new domain that clears the gate, be deterministic, and stay total on hostile input.
// Small configs keep the mutation gate fast; the full 7-domain measured receipt lives in tools/run-tier.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary, GATE_AUC } from '../konomi-slm.mjs';
import { growTier, tierReceipt, deepen, patternFromGenome, loadAny } from '../grow-tier.mjs';
import { stemGenome } from '../vendor/seed-library/seedlib.mjs';

const CFG = { population: 12, elites: 3, generations: 10 };            // small + fast, guarantees hold at any size
const tier1 = buildLibrary(['triage', 'water'], {});                   // synthetic domains -> no CSV needed
const tier2 = growTier(tier1, { ctx: {}, newDomains: ['fraud', 'maintenance'], deepenCfg: CFG });

test('growTier: tier 2 is a superset of tier 1 (breadth never shrinks)', () => {
  assert.equal(tier2.ok, true);
  for (const d of tier1.domains) assert.ok(tier2.domains.includes(d), `${d} survives into tier 2`);
  assert.ok(tier2.domains.length >= tier1.domains.length);
});

test('MONOTONE: no existing domain regresses on held-out AUC', () => {
  for (const d of tier1.domains) {
    assert.ok(tier2.patterns[d].heldAuc >= tier1.patterns[d].heldAuc - 1e-9,
      `${d}: tier2 ${tier2.patterns[d].heldAuc} >= tier1 ${tier1.patterns[d].heldAuc}`);
  }
});

test('the gate holds across the tier: every pattern in tier 2 is verified', () => {
  for (const d of tier2.domains) assert.ok(tier2.patterns[d].heldAuc >= GATE_AUC, `${d} cleared the gate`);
  for (const c of tier2.cut) assert.ok(c.heldAuc === undefined || c.heldAuc < GATE_AUC, 'a cut domain was below the gate');
});

test('determinism: growing the same tier twice is byte-identical', () => {
  const again = growTier(tier1, { ctx: {}, newDomains: ['fraud', 'maintenance'], deepenCfg: CFG });
  assert.deepEqual(again.seeds, tier2.seeds);
  assert.equal(again.meanHeldAuc, tier2.meanHeldAuc);
  assert.deepEqual(again.domains, tier2.domains);
});

test('tierReceipt: reports monotone, lists what was added, and is content-hashed', () => {
  const r = tierReceipt(tier1, tier2);
  assert.equal(r.monotone, true);
  assert.equal(r.to.domains >= r.from.domains, true);
  assert.match(r.receiptHash, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(r.added));
});

test('GOLDEN: the deterministic tier-2 output is pinned exactly (kills search-trajectory mutants)', () => {
  // growTier is deterministic; any change to the GA (comparator, loop bounds, seeds) changes the champion,
  // which changes these exact AUCs/seeds. Pinning them makes those mutations observable.
  const GOLD = {
    domains: ['triage', 'water', 'fraud', 'maintenance'], meanHeldAuc: 0.802588, libraryBytes: 226,
    perDomain: {
      triage: { heldAuc: 0.884343, seedStr: '◊ seed.v1 triage 7 g:24.4.16 334a2f458eef' },
      water: { heldAuc: 0.78709, seedStr: '◊ seed.v1 water 48990 f:bf35dbc06818dff35d0d 5af15d01887e' },
      fraud: { heldAuc: 0.743855, seedStr: '◊ seed.v1 fraud 48494 f:39dcc6addcce2dddd62d da405de58f8d' },
      maintenance: { heldAuc: 0.795066, seedStr: '◊ seed.v1 maintenance 12161 f:ffe1c6addcceeddfd62d 3d40b3ecee28' },
    },
  };
  assert.deepEqual(tier2.domains, GOLD.domains);
  assert.equal(tier2.meanHeldAuc, GOLD.meanHeldAuc);
  assert.equal(tier2.libraryBytes, GOLD.libraryBytes);
  for (const d of GOLD.domains) {
    assert.equal(tier2.patterns[d].heldAuc, GOLD.perDomain[d].heldAuc, `${d} heldAuc pinned`);
    assert.equal(tier2.patterns[d].seedStr, GOLD.perDomain[d].seedStr, `${d} seed pinned`);
  }
});

test('tierReceipt monotone logic: equal holds, strictly-worse regresses', () => {
  const prev = { domains: ['x'], patterns: { x: { heldAuc: 0.80 } }, meanHeldAuc: 0.80, libraryBytes: 10 };
  const equal = { domains: ['x'], patterns: { x: { heldAuc: 0.80 } }, meanHeldAuc: 0.80, libraryBytes: 10 };
  const worse = { domains: ['x'], patterns: { x: { heldAuc: 0.70 } }, meanHeldAuc: 0.70, libraryBytes: 10 };
  const edge = { domains: ['x'], patterns: { x: { heldAuc: 0.80 - 1e-9 } }, meanHeldAuc: 0.80, libraryBytes: 10 };
  assert.equal(tierReceipt(prev, equal).monotone, true, 'tier2 == tier1 is monotone (>=)');
  assert.equal(tierReceipt(prev, edge).monotone, true, 'within the 1e-9 tolerance band counts as not-worse (>= at the boundary)');
  assert.equal(tierReceipt(prev, worse).monotone, false, 'tier2 < tier1 must flag a regression');
  assert.equal(tierReceipt(prev, { domains: ['x'], patterns: {}, meanHeldAuc: 0, libraryBytes: 0 }).monotone, false, 'a dropped domain is not monotone');
});

test('deepen: returns a usable genome and never throws on a tiny set', () => {
  const ds = loadAny('fraud');
  const g = deepen(ds, ds.trainRows.slice(0, 60), 123, { population: 6, elites: 2, generations: 4 }, [stemGenome()]);
  assert.equal(typeof g.on, 'number');
});

test('patternFromGenome: builds a verified-shaped pattern whose fields are sane', () => {
  const ds = loadAny('maintenance');
  const p = patternFromGenome(ds, 'maintenance', stemGenome(), 7);
  assert.equal(p.domain, 'maintenance');
  assert.equal(p.title, 'Predictive maintenance', 'title resolves through the metadata fallback');
  assert.equal(p.real, false);
  assert.ok(p.heldAuc >= 0 && p.heldAuc <= 1);
  assert.equal(typeof p.verified, 'boolean');
  assert.equal(typeof p.patternId, 'string');
  assert.ok(p.seedStr.startsWith('◊ seed.v1'));
});

test('totality: growTier rejects a non-library and loadAny rejects an unknown domain', () => {
  assert.equal(growTier(null).ok, false);
  assert.equal(growTier({}).ok, false);
  assert.equal(growTier({ patterns: {} }).ok, false, 'a library with no domains array is rejected, not iterated');
  assert.equal(growTier({ patterns: {}, domains: null }).ok, false);
  assert.equal(loadAny('no-such-domain').ok, false);
});
