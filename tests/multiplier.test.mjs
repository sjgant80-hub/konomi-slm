// tests/multiplier.test.mjs — THE MULTIPLIER's scoring kernel, held to the seal in CLAIMS-MULTIPLIER.md.
// What must hold: the sample, the prompt, the parse rule, the metrics, the paired bootstrap and every claim's bar are
// exactly as sealed; the kernel never throws on garbage. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readSeal, sampleRows, formatValue, promptFor, parseReply, modelLabel, modelScore, mulberry32, balancedAccuracy,
  interval, bootstrap, judge, PAIRS, PER_CLASS, BOOT, PARSED_MIN, MODEL_ARMS,
} from '../tools/multiplier.mjs';
import { auc } from '../vendor/seed-library/seedlib.mjs';

const CLAIMS = readFileSync(new URL('../CLAIMS-MULTIPLIER.md', import.meta.url), 'utf8');
const SEAL = readSeal(CLAIMS).seal;
const SESSION = { Administrative: 3, Administrative_Duration: 89.6, Informational: 0, Informational_Duration: 0, ProductRelated: 57,
  ProductRelated_Duration: 1721.94, BounceRates: 0, ExitRates: 0.005882, PageValues: 204.0137, SpecialDay: 0 };

test('readSeal · the real seal, and each refusal with its reason', () => {
  const r = readSeal(CLAIMS);
  assert.equal(r.ok, true);
  assert.equal(r.seal.test, 'MULTIPLIER');
  assert.deepEqual(r.seal.claims.map((c) => c.id), ['X1', 'X2', 'X3', 'X4', 'X5', 'X6']);
  assert.equal(r.seal.claims[0].primary, true);
  assert.deepEqual(readSeal(null), { ok: false, why: 'no sealed json block' });
  assert.deepEqual(readSeal('no block here'), { ok: false, why: 'no sealed json block' });
  assert.deepEqual(readSeal('```json\n{bad\n```'), { ok: false, why: 'the sealed block is not JSON' });
  assert.deepEqual(readSeal('```json\n{"test":"OTHER","promptP":[]}\n```'), { ok: false, why: 'not the multiplier seal' });
  assert.deepEqual(readSeal('```json\n{"test":"MULTIPLIER","promptP":"x"}\n```'), { ok: false, why: 'not the multiplier seal' });
  assert.deepEqual(readSeal('```json\nnull\n```'), { ok: false, why: 'not the multiplier seal' });
  assert.equal(readSeal('```json\n{"test":"MULTIPLIER","promptP":[]}\n```').ok, true);
});

test('the constants are the seal\'s', () => {
  assert.equal(PER_CLASS, 100);
  assert.deepEqual({ ...BOOT }, { resamples: 2000, seed: 20261105 });
  assert.equal(PARSED_MIN, 190);
  assert.deepEqual([...MODEL_ARMS], ['R14', 'R7', 'B7']);
  assert.deepEqual(Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [k, [...v]])),
    { X1: ['KF', 'R14', 'auc'], X2: ['KF', 'R7', 'auc'], X3: ['KF', 'R14', 'bal'], X4: ['B7', 'R7', 'auc'], X5: ['B7', 'R14', 'auc'] });
});

test('sampleRows · P[floor(k|P|/100)] then N[floor(k|N|/100)], in file order', () => {
  // 150 positives (every row with i % 3 === 0 among 450 rows) and 300 negatives
  const held = Array.from({ length: 450 }, (_, i) => i + 1000);
  const y = new Uint8Array(1450); for (const i of held) y[i] = (i - 1000) % 3 === 0 ? 1 : 0;
  const s = sampleRows(held, y);
  const P = held.filter((i) => y[i] === 1), N = held.filter((i) => y[i] === 0);
  assert.equal(s.length, 200);
  assert.deepEqual(s.slice(0, 5), [P[0], P[1], P[3], P[4], P[6]]);           // floor(1.5k): 0 1 3 4 6
  assert.deepEqual(s.slice(100, 104), [N[0], N[3], N[6], N[9]]);             // floor(3k)
  assert.equal(s[99], P[148]); assert.equal(s[199], N[297]);
  assert.ok(s.slice(0, 100).every((i) => y[i] === 1) && s.slice(100).every((i) => y[i] === 0));
  // exactly 100 of a class is enough; 99 is not
  const y2 = new Uint8Array(200); for (let i = 0; i < 100; i++) y2[i] = 1;
  assert.deepEqual(sampleRows([...Array(200).keys()], y2), [...Array(200).keys()]);
  y2[99] = 0;
  assert.deepEqual(sampleRows([...Array(200).keys()], y2), []);
  const y3 = new Uint8Array(200); for (let i = 0; i < 101; i++) y3[i] = 1;
  assert.deepEqual(sampleRows([...Array(200).keys()], y3), []);              // only 99 negatives
  assert.deepEqual(sampleRows(null, y), []); assert.deepEqual(sampleRows(held, null), []); assert.deepEqual(sampleRows(held, {}), []);
});

test('formatValue · the sealed decimal places per feature', () => {
  assert.equal(formatValue('Administrative', 3), '3');
  assert.equal(formatValue('ProductRelated', 57), '57');
  assert.equal(formatValue('Informational', 2.6), '3');
  assert.equal(formatValue('Administrative_Duration', 89.6), '89.6');
  assert.equal(formatValue('Informational_Duration', 0), '0.0');
  assert.equal(formatValue('ProductRelated_Duration', 1721.94), '1721.9');
  assert.equal(formatValue('BounceRates', 0), '0.0000');
  assert.equal(formatValue('ExitRates', 0.005882), '0.0059');
  assert.equal(formatValue('PageValues', 204.0137), '204.01');
  assert.equal(formatValue('SpecialDay', 0.4), '0.4');
  assert.equal(formatValue('Month', 3), '');
  assert.equal(formatValue('PageValues', NaN), '');
  assert.equal(formatValue('PageValues', 'x'), '');
  assert.equal(formatValue('toString', 1), '');
});

test('promptFor · the sealed lines joined by one newline; the book trimmed, then a blank line, then P', () => {
  const p = promptFor(SEAL, SESSION);
  const lines = p.split('\n');
  assert.equal(lines.length, SEAL.promptP.length);
  assert.equal(lines[0], SEAL.promptP[0]);
  assert.equal(lines[3], 'Administrative: 3');
  assert.equal(lines[8], 'ProductRelated_Duration: 1721.9');
  assert.equal(lines[11], 'PageValues: 204.01');
  assert.equal(lines[13], SEAL.promptP[13]);
  assert.ok(!p.includes('{'), 'every placeholder filled');
  const b = promptFor(SEAL, SESSION, '\n  THE BOOK  \n\n');
  assert.equal(b, 'THE BOOK\n\n' + p);
  assert.equal(promptFor(SEAL, SESSION, 7), p, 'a non-string book is no book');
  assert.equal(promptFor(null, SESSION), '');
  assert.equal(promptFor({ promptP: 'x' }, SESSION), '');
  assert.equal(promptFor(SEAL, null), '');
  assert.equal(promptFor(SEAL, 'x'), '');
  assert.equal(promptFor({ promptP: ['a {Nope} b'] }, {}), 'a  b');
});

test('parseReply · the first run of digits, 1 to 3 of them, 0 to 100', () => {
  assert.equal(parseReply('85'), 85);
  assert.equal(parseReply(' 7%'), 7);
  assert.equal(parseReply('100'), 100);
  assert.equal(parseReply('0'), 0);
  assert.equal(parseReply('Probability: 42.'), 42);
  assert.equal(parseReply('0.85'), 0);
  assert.equal(parseReply('101'), null);
  assert.equal(parseReply('1000'), null);
  assert.equal(parseReply('0100'), null);
  assert.equal(parseReply('none'), null);
  assert.equal(parseReply(''), null);
  assert.equal(parseReply(null), null);
  assert.equal(parseReply(85), null);
});

test('modelLabel / modelScore · 50 or more is a purchase; unparsed has no label and scores 50', () => {
  assert.equal(modelLabel(50), 1); assert.equal(modelLabel(49), 0); assert.equal(modelLabel(0), 0); assert.equal(modelLabel(100), 1);
  assert.equal(modelLabel(null), null); assert.equal(modelLabel(undefined), null);
  assert.equal(modelScore(null), 50); assert.equal(modelScore(undefined), 50); assert.equal(modelScore(0), 0); assert.equal(modelScore(73), 73);
});

test('mulberry32 · the standard stream, pinned', () => {
  const r = mulberry32(20261105);
  assert.deepEqual([r(), r(), r()], [0.10204124473966658, 0.6270352604333311, 0.22736229840666056]);
  const q = mulberry32(1);
  assert.deepEqual([q(), q()], [0.6270739405881613, 0.002735721180215478]);
});

test('balancedAccuracy · mean recall over the classes present; a null label is a miss', () => {
  assert.equal(balancedAccuracy([1, 0, 1, null], [1, 1, 0, 0]), 0.25);
  assert.equal(balancedAccuracy([1, 1, 0, 0], [1, 1, 0, 0]), 1);
  assert.equal(balancedAccuracy([1, 1, 1, 0], [1, 1, 0, 0]), 0.75);
  assert.equal(balancedAccuracy([1, 0, 0], [1, 1, 1]), 1 / 3);
  assert.equal(balancedAccuracy([0, 0], [0, 0]), 1);
  assert.equal(balancedAccuracy([1], [1, 0]), 0);
  assert.equal(balancedAccuracy([], []), 0);
  assert.equal(balancedAccuracy(null, [1]), 0);
  assert.equal(balancedAccuracy([1], 'x'), 0);
});

test('interval · sorted element floor(0.025 B) and floor(0.975 B)', () => {
  const d = Array.from({ length: 2000 }, (_, i) => (i * 7919) % 2000);   // 0..1999 shuffled
  assert.deepEqual(interval(d), { lo: 50, hi: 1950 });
  assert.deepEqual(interval([5, 1, 3, 2, 4]), { lo: 1, hi: 5 });
  assert.deepEqual(interval(Array.from({ length: 40 }, (_, i) => 40 - i)), { lo: 2, hi: 40 });
  assert.deepEqual(interval([]), { lo: null, hi: null });
  assert.deepEqual(interval(null), { lo: null, hi: null });
  const keep = [3, 1, 2]; interval(keep); assert.deepEqual(keep, [3, 1, 2], 'does not sort the caller\'s list');
});

// a small labelled sample: 6 purchases then 6 not
const Y = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
const PERFECT = { scores: [9, 8, 7, 9, 8, 7, 1, 2, 3, 1, 2, 3], labels: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0] };
const FLAT = { scores: Array(12).fill(5), labels: Array(12).fill(1) };
const MIXED = { scores: [9, 1, 7, 2, 8, 3, 6, 2, 8, 1, 4, 3], labels: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0] };

test('bootstrap · paired and stratified: 100 purchase draws then 100 no-purchase draws per resample', () => {
  const pairs = { A: ['P', 'F', 'auc'], B: ['P', 'F', 'bal'], C: ['M', 'F', 'auc'], Z: ['P', 'missing', 'auc'] };
  const d = bootstrap({ P: PERFECT, F: FLAT, M: MIXED }, Y, { resamples: 4, seed: 11, pairs });
  assert.deepEqual(d.A, [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(d.B, [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(d.Z, []);
  // resample 0 rebuilt by hand from the same stream
  const r = mulberry32(11), idx = [];
  for (let k = 0; k < 100; k++) idx.push(Math.floor(r() * 6));
  for (let k = 0; k < 100; k++) idx.push(6 + Math.floor(r() * 6));
  const want0 = auc(idx.map((i) => MIXED.scores[i]), idx.map((i) => Y[i])) - 0.5;
  assert.equal(d.C[0], want0);
  // resample 1 continues the one stream
  const idx1 = [];
  for (let k = 0; k < 100; k++) idx1.push(Math.floor(r() * 6));
  for (let k = 0; k < 100; k++) idx1.push(6 + Math.floor(r() * 6));
  assert.equal(d.C[1], auc(idx1.map((i) => MIXED.scores[i]), idx1.map((i) => Y[i])) - 0.5);
  assert.notDeepEqual(bootstrap({ M: MIXED, F: FLAT }, Y, { resamples: 4, seed: 12, pairs: { C: ['M', 'F', 'auc'] } }).C, d.C);
  assert.deepEqual(bootstrap({ M: MIXED, F: FLAT }, Y, { resamples: 4, seed: 11, pairs: { C: ['M', 'F', 'auc'] } }).C, d.C);
  assert.equal(bootstrap({ M: MIXED, F: FLAT }, Y, { pairs: { C: ['M', 'F', 'auc'] } }).C.length, 2000, 'the sealed default is 2,000 resamples');
  assert.deepEqual(bootstrap({ P: PERFECT }, [1, 1], { pairs }), {});
  assert.deepEqual(bootstrap({ P: PERFECT }, [0, 0], { pairs }), {});
  assert.deepEqual(bootstrap(null, Y), {});
  assert.deepEqual(bootstrap({}, 'x'), {});
});

const ARMS = (over = {}) => ({ KF: PERFECT, K3: MIXED, K1: FLAT, R14: FLAT, R7: MIXED, B7: PERFECT, ...over });
const PARSED = { R14: 200, R7: 200, B7: 200 };
const SMALL = { resamples: 50, seed: 3 };
const claim = (j, id) => j.claims.find((c) => c.id === id);

test('judge · every metric, each claim with its interval, the multiplier = X1', () => {
  const j = judge(ARMS(), Y, PARSED, SMALL);
  assert.equal(j.ok, true);
  assert.deepEqual(j.auc, { KF: 1, K3: Math.round(auc(MIXED.scores, Y) * 1e6) / 1e6, K1: 0.5, R14: 0.5, R7: Math.round(auc(MIXED.scores, Y) * 1e6) / 1e6, B7: 1 });
  assert.deepEqual(j.balancedAccuracy, { KF: 1, K3: Math.round(balancedAccuracy(MIXED.labels, Y) * 1e6) / 1e6, K1: 0.5, R14: 0.5, R7: Math.round(balancedAccuracy(MIXED.labels, Y) * 1e6) / 1e6, B7: 1 });
  assert.deepEqual(claim(j, 'X1'), { id: 'X1', metric: 'auc', arm: 'KF', minus: 'R14', diff: 0.5, lo: 0.5, hi: 0.5, holds: true });
  assert.deepEqual(claim(j, 'X3'), { id: 'X3', metric: 'bal', arm: 'KF', minus: 'R14', diff: 0.5, lo: 0.5, hi: 0.5, holds: true });
  assert.equal(claim(j, 'X5').holds, true);
  assert.equal(claim(j, 'X2').diff, Math.round((1 - Math.round(auc(MIXED.scores, Y) * 1e6) / 1e6) * 1e6) / 1e6, 'X2 is scored on AUC, not balanced accuracy');
  assert.notEqual(auc(MIXED.scores, Y), balancedAccuracy(MIXED.labels, Y));
  assert.equal(claim(j, 'X2').holds, claim(j, 'X2').lo > 0);
  assert.equal(j.multiplierProven, true);
  assert.deepEqual(claim(j, 'X6'), { id: 'X6', parsed: { R14: 200, R7: 200, B7: 200 }, min: 190, holds: true });
  assert.equal(j.claims.length, 6);
});

test('judge · a tie fails, a loss fails, a positive point with a low end at or under 0 fails', () => {
  const tie = judge(ARMS({ KF: FLAT }), Y, PARSED, SMALL);
  assert.deepEqual(claim(tie, 'X1'), { id: 'X1', metric: 'auc', arm: 'KF', minus: 'R14', diff: 0, lo: 0, hi: 0, holds: false });
  assert.equal(tie.multiplierProven, false);
  const loss = judge(ARMS({ KF: FLAT, R14: PERFECT }), Y, PARSED, SMALL);
  assert.equal(claim(loss, 'X1').diff, -0.5); assert.equal(claim(loss, 'X1').holds, false);
  // a near-tie: KF ahead on the point estimate, but the (one-resample) interval's low end is below 0
  const near = { scores: [7.5, 2.5, 7, 2, 8, 3, 6, 2, 8, 1, 4, 3], labels: MIXED.labels };
  const c = claim(judge(ARMS({ KF: near, R14: MIXED }), Y, PARSED, { resamples: 1, seed: 3 }), 'X1');
  assert.deepEqual(c, { id: 'X1', metric: 'auc', arm: 'KF', minus: 'R14', diff: 0.013889, lo: -0.0006, hi: -0.0006, holds: false });
  // and the same pair on a resample whose low end is above 0 holds
  const up = claim(judge(ARMS({ KF: near, R14: MIXED }), Y, PARSED, { resamples: 1, seed: 1 }), 'X1');
  assert.equal(up.lo > 0, up.holds);
});

test('judge · X6 needs 190 of 200 replies read from every model arm', () => {
  assert.equal(claim(judge(ARMS(), Y, { R14: 190, R7: 190, B7: 190 }, SMALL), 'X6').holds, true);
  assert.equal(claim(judge(ARMS(), Y, { R14: 190, R7: 189, B7: 200 }, SMALL), 'X6').holds, false);
  assert.equal(claim(judge(ARMS(), Y, { R14: 200, R7: 200, B7: 189 }, SMALL), 'X6').holds, false);
  assert.deepEqual(claim(judge(ARMS(), Y, { R14: '200', R7: 200.5 }, SMALL), 'X6'), { id: 'X6', parsed: { R14: 0, R7: 0, B7: 0 }, min: 190, holds: false });
});

test('judge · refusals: no sample, an arm short of the sample, a missing arm or labels', () => {
  assert.deepEqual(judge(null, Y, PARSED), { ok: false, why: 'arms, labels and parse counts' });
  assert.deepEqual(judge(ARMS(), [], PARSED), { ok: false, why: 'arms, labels and parse counts' });
  assert.deepEqual(judge(ARMS(), 'x', PARSED), { ok: false, why: 'arms, labels and parse counts' });
  assert.deepEqual(judge(ARMS(), Y, null), { ok: false, why: 'arms, labels and parse counts' });
  assert.deepEqual(judge(ARMS({ R14: { scores: [1, 2] } }), Y, PARSED, SMALL), { ok: false, why: 'arm R14 does not cover the sample' });
  assert.deepEqual(judge(ARMS({ R7: null }), Y, PARSED, SMALL), { ok: false, why: 'arm R7 does not cover the sample' });
  const noB7 = judge({ KF: PERFECT, R14: FLAT, R7: MIXED }, Y, PARSED, SMALL);
  assert.deepEqual(claim(noB7, 'X4'), { id: 'X4', holds: false, why: 'an arm is missing' });
  assert.equal(claim(noB7, 'X1').holds, true);
  const noLabels = judge(ARMS({ KF: { scores: PERFECT.scores } }), Y, PARSED, SMALL);
  assert.deepEqual(claim(noLabels, 'X3'), { id: 'X3', holds: false, why: 'an arm is missing' });
  assert.equal(claim(noLabels, 'X1').holds, true, 'an AUC claim needs no labels');
  const oneClass = judge(ARMS(), Array(12).fill(1), PARSED, SMALL);
  assert.equal(oneClass.ok, true);
  assert.deepEqual(oneClass.claims.slice(0, 5).map((c) => c.why), Array(5).fill('an arm is missing'));
  assert.equal(noLabels.balancedAccuracy.KF, undefined);
  const shortLabels = judge(ARMS({ KF: { scores: PERFECT.scores, labels: [1] } }), Y, PARSED, SMALL);
  assert.equal(shortLabels.balancedAccuracy.KF, undefined);
  assert.equal(judge(ARMS(), Y, PARSED, { resamples: 0, seed: 1 }).claims[0].why, 'an arm is missing');
});

test('totality · garbage never throws', () => {
  const G = [undefined, null, 0, 'x', [], {}, true, () => 1, NaN, { scores: 'x' }];
  for (const a of G) for (const b of G) {
    assert.doesNotThrow(() => readSeal(a)); assert.doesNotThrow(() => sampleRows(a, b)); assert.doesNotThrow(() => formatValue(a, b));
    assert.doesNotThrow(() => promptFor(a, b)); assert.doesNotThrow(() => parseReply(a)); assert.doesNotThrow(() => balancedAccuracy(a, b));
    assert.doesNotThrow(() => interval(a)); assert.doesNotThrow(() => bootstrap(a, b, { resamples: 2 })); assert.doesNotThrow(() => judge(a, b, a, { resamples: 2, seed: 1 }));
  }
});
