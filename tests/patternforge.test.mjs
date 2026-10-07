// tests/patternforge.test.mjs — the PatternForge loop, with a STUB proposer so the gate/breed/observe/ship path is
// deterministic and CI-runnable (the real proposer is the local 14b — non-deterministic, exercised by run-forge).
// What must hold: the forge ships a verified pattern (graded on held-out), an owned seed that decodes, a readable
// book, a content-hashed receipt, and the observer pass never makes validation worse. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeOrgan, patternBook } from '../tools/patternforge.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { decodeSeed, stemGenome } from '../vendor/seed-library/seedlib.mjs';

const CFG = { population: 12, elites: 3, generations: 10 };
const ds = loadDomain('triage', {});
// a deterministic stub standing in for the 14b: proposes two features, returns a neutral genome
const stub = async () => ({ ok: true, model: 'stub', hypotheses: [{ feature: 'spO2', direction: 'low' }, { feature: 'respRate', direction: 'high' }], genome: stemGenome() });

test('forgeOrgan ships a verified pattern, an owned seed, a book and a receipt', async () => {
  const r = await forgeOrgan(ds, { label1: 'the patient is critical', cfg: CFG, proposer: stub, provenance: 'test' });
  assert.equal(r.ok, true);
  assert.ok(r.heldAuc >= 0 && r.heldAuc <= 1);
  assert.ok(r.ownedSeed.startsWith('◊ seed.v1'));
  assert.equal(decodeSeed(r.ownedSeed).ok, true, 'the owned seed decodes + passes the SENTINEL guard');
  assert.match(r.book, /PATTERN BOOK/);
  assert.match(r.receipt.receiptHash, /^[0-9a-f]{64}$/);
  assert.equal(typeof r.selectedBy, 'string');
  assert.ok(r.mindContext.includes('Verified patterns'), 'ships the mind-context (the level-up artifact)');
});

test('forgeOrgan is deterministic with a fixed proposer', async () => {
  const a = await forgeOrgan(ds, { label1: 'x', cfg: CFG, proposer: stub, provenance: 't' });
  const b = await forgeOrgan(ds, { label1: 'x', cfg: CFG, proposer: stub, provenance: 't' });
  assert.equal(a.ownedSeed, b.ownedSeed);
  assert.equal(a.heldAuc, b.heldAuc);
  assert.equal(a.selectedBy, b.selectedBy);
});

test('forgeOrgan falls back to search when the proposer is unavailable (never throws)', async () => {
  const down = async () => ({ ok: false, error: 'proposer down' });
  const r = await forgeOrgan(ds, { label1: 'x', cfg: CFG, proposer: down, provenance: 't' });
  assert.equal(r.ok, true);
  assert.equal(r.proposer, 'stem (proposer unavailable)');
  assert.ok(r.heldAuc >= 0 && r.heldAuc <= 1);
});

test('patternBook renders each rule in plain language with direction and weight', () => {
  const pattern = { rules: [{ feat: 'spO2', op: '<=', v: 92, w: 1 }, { feat: 'respRate', op: '>', v: 24, w: -0.5 }], heldAuc: 0.8, heldAcc: 0.77, held: 100 };
  const book = patternBook('triage', 'the patient is critical', pattern, 'test');
  assert.match(book, /when spO2 is at or below 92.*MORE likely/s);
  assert.match(book, /when respRate is above 24.*LESS likely/s);
  assert.match(book, /held-out AUC 0\.8/);
});

test('forgeOrgan on a dead dataset returns ok:false, never throws', async () => {
  const r = await forgeOrgan({ ok: false }, { proposer: stub });
  assert.equal(r.ok, false);
});
