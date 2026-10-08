// tests/council.test.mjs — the GATED COUNCIL, with stub members (no LLM) so the gate/cross-breed/observe/scoreboard
// path is deterministic and CI-runnable. The real council is the local models; here we prove the contract: the gate
// disposes (best by validation, not a vote), a down member is handled, the result is verified, deterministic, total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeWithCouncil } from '../tools/council.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { stemGenome, randomGenome, rng } from '../vendor/seed-library/seedlib.mjs';

const ds = loadDomain('triage', {});
const CFG = { population: 12, elites: 3, generations: 10 };
// stub members: deterministic "proposers" that never touch Ollama
const council = [
  { name: 'stubA', propose: async () => ({ ok: true, model: 'stubA', hypotheses: [{ feature: 'spO2', direction: 'low' }], genome: stemGenome() }) },
  { name: 'stubB', propose: async () => ({ ok: true, model: 'stubB', hypotheses: [{ feature: 'respRate', direction: 'high' }], genome: randomGenome(rng(5)) }) },
  { name: 'down', propose: async () => ({ ok: false, error: 'offline' }) },
];

test('the gate disposes: council ships a verified pattern and names the winner', async () => {
  const r = await forgeWithCouncil(ds, { label1: 'the patient is critical', cfg: CFG, council, provenance: 'test' });
  assert.equal(r.ok, true);
  assert.ok(r.heldAuc >= 0 && r.heldAuc <= 1);
  assert.equal(typeof r.winner, 'string');
  assert.ok(r.ownedSeed.startsWith('◊ seed.v1'));
  assert.match(r.receipt.receiptHash, /^[0-9a-f]{64}$/);
  assert.match(r.collusionProof, /no member can game or collude/);
});

test('scoreboard includes the model-free search anchor and every live member, ranked by validation', async () => {
  const r = await forgeWithCouncil(ds, { label1: 'x', cfg: CFG, council, provenance: 't' });
  const members = r.scoreboard.map((s) => s.member);
  assert.ok(members.some((m) => /search/.test(m)), 'the search anchor is always a council member');
  for (let i = 1; i < r.scoreboard.length; i++) assert.ok(r.scoreboard[i - 1].val >= r.scoreboard[i].val, 'ranked by validation');
  assert.deepEqual(r.dropped, ['down'], 'an offline member is dropped, not fatal');
});

test('the council is deterministic with fixed members', async () => {
  const a = await forgeWithCouncil(ds, { label1: 'x', cfg: CFG, council, provenance: 't' });
  const b = await forgeWithCouncil(ds, { label1: 'x', cfg: CFG, council, provenance: 't' });
  assert.equal(a.ownedSeed, b.ownedSeed);
  assert.equal(a.heldAuc, b.heldAuc);
  assert.equal(a.winner, b.winner);
});

test('even if every model member is down, the search anchor still ships a verified organ', async () => {
  const allDown = [{ name: 'x', propose: async () => ({ ok: false }) }, { name: 'y', propose: async () => ({ ok: false }) }];
  const r = await forgeWithCouncil(ds, { label1: 'x', cfg: CFG, council: allDown, provenance: 't' });
  assert.equal(r.ok, true);
  assert.match(r.winner, /search/);
  assert.ok(r.heldAuc > 0.5, 'search alone still finds signal — collusion-proof anchor holds');
});

test('a dead dataset returns ok:false, never throws', async () => {
  const r = await forgeWithCouncil({ ok: false }, { council });
  assert.equal(r.ok, false);
});
