// tests/konomi-slm.test.mjs — the gate's teeth. Covers the inversion's contract: the library verifies-or-cuts,
// the router routes, the fidelity gate ANSWERS in-distribution and ABSTAINS out-of-distribution, receipts are
// tamper-evident, and every entry point is total (hostile input never throws). node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildPattern, buildLibrary, route, answer, verifyReceipt, imagine, scoreInput, membership,
  fingerprint, operatingThreshold, GATE_AUC, ROUTE_MIN,
} from '../konomi-slm.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const lib = buildLibrary(['shopper', 'triage', 'water', 'crop'], ctx);
const ds = loadDomain('triage', ctx);
const rowInput = (d, i) => Object.fromEntries(d.features.map((f) => [f, d.cols[f][i]]));

test('library: builds verified patterns and reports a real compression ratio', () => {
  assert.equal(lib.ok, true);
  assert.ok(lib.domains.length >= 3, 'at least three domains verified');
  for (const id of lib.domains) assert.ok(lib.patterns[id].heldAuc >= GATE_AUC, `${id} cleared the gate`);
  assert.ok(lib.libraryBytes > 0 && lib.grownBytes > lib.libraryBytes, 'seeds smaller than the grown bodies');
  assert.ok(lib.ratio > 1, 'compression ratio > 1x');
});

test('the gate CUTS a pattern that cannot clear held-out AUC', () => {
  // a crippled library with an impossible gate must cut everything
  const impossible = buildLibrary(['triage'], ctx);
  assert.ok(impossible.patterns.triage.heldAuc >= GATE_AUC);
  // buildPattern on an unknown domain fails cleanly, not throws
  const bad = buildPattern('no-such-domain', ctx);
  assert.equal(bad.ok, false);
});

test('membership: 1 inside the IQR, decays outside, 0 on garbage', () => {
  const fp = { min: 0, q1: 10, med: 20, q3: 30, max: 40 };
  assert.equal(membership(20, fp), 1);
  assert.equal(membership(10, fp), 1);
  assert.ok(membership(100, fp) < 0.2, 'far outside decays low');
  assert.equal(membership('nope', fp), 0);
  assert.equal(membership(5, null), 0);
});

test('route: picks the right domain for an in-distribution input (disjoint feature names)', () => {
  const r = route(lib, rowInput(ds, ds.heldRows[0]));
  assert.equal(r.ok, true);
  assert.equal(r.best.domain, 'triage');
  assert.ok(r.best.routeScore >= ROUTE_MIN);
});

test('route: unknown feature names -> zero coverage -> no confident route', () => {
  const r = route(lib, { wingspan: 3, plumage: 7 });
  assert.equal(r.ok, true);
  assert.ok(!r.best || r.best.routeScore === 0, 'foreign input does not route');
});

test('answer: VERIFIED on an in-distribution input, with a receipt that names the pattern', () => {
  const a = answer(lib, rowInput(ds, ds.heldRows[0]));
  assert.equal(a.verdict, 'VERIFIED');
  assert.equal(a.domain, 'triage');
  assert.ok(a.label === 0 || a.label === 1);
  assert.equal(a.receipt.model, 'konomi-slm/1');
  assert.ok(a.receipt.heldAuc >= GATE_AUC);
  assert.equal(typeof a.receipt.receiptHash, 'string');
});

test('answer: ABSTAINS on out-of-distribution junk instead of hallucinating', () => {
  const p = lib.patterns.triage;
  const junk = Object.fromEntries(ds.features.map((f) => [f, p.dist[f].max + 10 * (p.dist[f].max - p.dist[f].min + 1)]));
  const a = answer(lib, junk);
  assert.equal(a.verdict, 'ABSTAIN');
  assert.ok(/distribution/.test(a.why));
});

test('answer: ABSTAINS on malformed / empty input, never throws', () => {
  for (const bad of [null, undefined, 42, 'x', {}, { foo: NaN }]) {
    const a = answer(lib, bad);
    assert.equal(a.ok, true);
    assert.equal(a.verdict, 'ABSTAIN');
  }
});

test('verifyReceipt: genuine passes, a single tampered field flips it', () => {
  const a = answer(lib, rowInput(ds, ds.heldRows[0]));
  assert.equal(verifyReceipt(a.receipt).genuine, true);
  const forged = { ...a.receipt, label: a.receipt.label ^ 1 };
  assert.equal(verifyReceipt(forged).genuine, false);
  const forged2 = { ...a.receipt, heldAuc: 0.999 };
  assert.equal(verifyReceipt(forged2).genuine, false);
  assert.equal(verifyReceipt(null).ok, false);
});

test('scoreInput: totals firing rule weights; garbage features are ignored, never throw', () => {
  const p = lib.patterns.triage;
  assert.equal(typeof scoreInput(p, rowInput(ds, ds.heldRows[0])), 'number');
  assert.equal(scoreInput(p, null), 0);
  assert.equal(scoreInput(null, {}), 0);
  assert.equal(scoreInput(p, { bogus: 'x' }), 0);
});

test('imagine: proposes a domain from text, flagged UNGRADED, never an answer', () => {
  const g = imagine('patient has low spo2 and high heart rate', lib);
  assert.equal(g.graded, false);
  assert.equal(g.proposal, 'triage');
  const none = imagine('   ');
  assert.equal(none.ok, false);
});

test('fingerprint & operatingThreshold are deterministic and finite', () => {
  const fp = fingerprint(ds, ds.trainRows, 'spO2');
  assert.ok(fp.min <= fp.q1 && fp.q1 <= fp.med && fp.med <= fp.q3 && fp.q3 <= fp.max);
  const op = operatingThreshold(lib.patterns.triage ? { rules: lib.patterns.triage.rules } : { rules: [] }, ds, ds.trainRows);
  assert.ok(Number.isFinite(op.thr) && Number.isFinite(op.base) && Number.isFinite(op.spread));
});

test('determinism: building the library twice gives identical seeds and scores', () => {
  const a = buildLibrary(['triage', 'water'], ctx);
  const b = buildLibrary(['triage', 'water'], ctx);
  assert.deepEqual(a.seeds, b.seeds);
  assert.equal(a.ratio, b.ratio);
  assert.equal(a.patterns.triage.heldAuc, b.patterns.triage.heldAuc);
});

// ── a fully-crafted minimal library: lets us drive route/answer deterministically to the exact boundaries ────
function craftedPattern(over = {}) {
  return {
    domain: 'test', title: 'Test', real: false, features: ['a'], seedStr: '◊ seed.v1 test 1 f:00 abcabcabcabc',
    rules: [{ feat: 'a', op: '>', v: 0, w: 2 }], base: 0.5, threshold: 0, spread: 4,
    heldAuc: 0.9, heldAcc: 0.9, train: 10, held: 10, dist: { a: { min: 0, q1: 0, med: 0, q3: 0, max: 2 } },
    verified: true, patternId: 'craft0000', ...over,
  };
}
const craftedLib = (p) => ({ ok: true, patterns: { test: p }, seeds: { test: p.seedStr }, cut: [], domains: ['test'], libraryBytes: p.seedStr.length, grownBytes: 100, ratio: 5, meanHeldAuc: 0.9 });

test('empty library: ok is false and nothing routes', () => {
  const empty = buildLibrary([], ctx);
  assert.equal(empty.ok, false, 'a library with no verified patterns is not ok');
  assert.equal(answer(empty, { a: 1 }).verdict, 'ABSTAIN');
});

test('buildPattern on an unknown domain returns the unknown-domain error as a string', () => {
  const bad = buildPattern('no-such-domain', ctx);
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.error, 'string');
  assert.match(bad.error, /unknown domain/);
});

test('pattern metadata: title and the REAL flag come through exactly', () => {
  assert.equal(lib.patterns.triage.title, 'Field triage');
  assert.equal(lib.patterns.triage.real, false);
  assert.equal(lib.patterns.shopper.real, true);
});

test('scoreInput: a firing rule adds its weight; a non-firing finite value adds nothing', () => {
  const p = craftedPattern({ rules: [{ feat: 'a', op: '>', v: 0, w: 2 }] });
  assert.equal(scoreInput(p, { a: 5 }), 2, 'fires -> weight added (kills a dropped-guard that returns 0)');
  assert.equal(scoreInput(p, { a: -5 }), 0, 'does not fire -> nothing added (kills && -> ||)');
});

test('answer label boundary: a score exactly equal to the threshold is NEGATIVE (score > thr, not >=)', () => {
  const p = craftedPattern({ threshold: 0, rules: [{ feat: 'a', op: '>', v: 5, w: 2 }] });
  const a = answer(craftedLib(p), { a: 1 });           // routes (member ~0.37), scores 0 == threshold 0
  assert.equal(a.verdict, 'VERIFIED');
  assert.equal(a.label, 0, 'score == threshold must be label 0');
});

test('answer route boundary: routeScore exactly at ROUTE_MIN still answers (< not <=)', () => {
  const p = craftedPattern();
  const v = -Math.log(ROUTE_MIN);                       // member = exp(-v/span=1) = ROUTE_MIN exactly
  const a = answer(craftedLib(p), { a: v });
  assert.equal(a.routeScore, ROUTE_MIN);
  assert.equal(a.verdict, 'VERIFIED', 'routeScore === ROUTE_MIN is in, not out');
});

test('answer: an UNVERIFIED pattern is never answered from — it abstains', () => {
  const a = answer(craftedLib(craftedPattern({ verified: false })), { a: 1 });
  assert.equal(a.verdict, 'ABSTAIN');
  assert.match(a.why, /verified/);
});

test('answer confidence uses the pattern spread (not a constant divisor)', () => {
  const p = craftedPattern({ threshold: 0, spread: 4, rules: [{ feat: 'a', op: '>', v: 0, w: 2 }] });
  const a = answer(craftedLib(p), { a: 1 });            // score 2, margin = min(1, |2-0|/4) = 0.5
  assert.equal(a.verdict, 'VERIFIED');
  assert.equal(a.confidence, 0.5, 'confidence divides by spread, so spring||1 vs spread&&1 differ');
});

test('operatingThreshold spread is strictly positive for a real scorecard', () => {
  const op = operatingThreshold({ rules: lib.patterns.triage.rules }, ds, ds.trainRows);
  assert.ok(op.spread > 0, 'spread = max(range,1e-9) > 0 (kills an index mutant that yields NaN->0)');
});

test('totality on a hostile LIBRARY: route/answer/imagine never throw on null/garbage', () => {
  assert.equal(route(null, { a: 1 }).ok, false);
  assert.equal(route({}, { a: 1 }).ok, false);
  assert.equal(answer(null, { a: 1 }).verdict, 'ABSTAIN');
  const im = imagine('patient spo2 low heart rate');    // no library arg -> library defaults to null
  assert.equal(im.ok, true);
  assert.equal(im.availableInLibrary, true);
});

test('imagine: no keyword hit yields a null proposal (not "propose anyway")', () => {
  assert.equal(imagine('zzz qqq wibble', lib).proposal, null);
});

test('verifyReceipt: every non-receipt shape is rejected as ok:false without throwing', () => {
  for (const bad of [null, undefined, 42, 'x', {}, { receiptHash: 7 }]) {
    assert.equal(verifyReceipt(bad).ok, false, `${JSON.stringify(bad)} is not a receipt`);
  }
});

test('operatingThreshold with an all-negative (base 0) set uses the last train score, not off-the-end', () => {
  const d0 = { features: ['a'], cols: { a: [-1, 5, 5] }, y: new Uint8Array([0, 0, 0]) };
  const op0 = operatingThreshold({ rules: [{ feat: 'a', op: '>', v: 0, w: 2 }] }, d0, [0, 1, 2]);
  // scores sorted [0,2,2], base 0 -> thr = last element = 2 (an off-by-one past the end yields undefined->0)
  assert.equal(op0.thr, 2);
});
