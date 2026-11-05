// tools/multiplier.mjs — THE MULTIPLIER, the pure scoring kernel (sealed in CLAIMS-MULTIPLIER.md before this file existed).
//
// Everything that turns recorded model replies and the Konomi arms' scores into a verdict lives here, and nothing else:
// the sample rule, the prompt, the parse rule, the metrics, the paired bootstrap and the claims, each exactly as the seal
// writes it. No model, no clock, no network, no file. The runner (tools/run-multiplier.mjs) asks the models once and
// records every reply; the checker (tools/check-multiplier.mjs) re-scores those replies with this kernel on GitHub's
// runner, so a reader re-derives every number without re-asking a model. Pure, total, deterministic: garbage in gives
// an empty or { ok: false } result, never a throw. Powered by the Konomi architecture, created by Thomas Frumkin.
import { auc } from '../vendor/seed-library/seedlib.mjs';

export const PER_CLASS = 100;                       // the seal: 100 purchase + 100 no-purchase sessions
export const BOOT = Object.freeze({ resamples: 2000, seed: 20261105 });
export const PARSED_MIN = 190;                      // X6: each model arm must have at least this many replies read
export const MODEL_ARMS = Object.freeze(['R14', 'R7', 'B7']);
export const KONOMI_ARMS = Object.freeze(['KF', 'K3', 'K1']);
// each difference claim: [arm, minus arm, metric]
export const PAIRS = Object.freeze({
  X1: ['KF', 'R14', 'auc'], X2: ['KF', 'R7', 'auc'], X3: ['KF', 'R14', 'bal'], X4: ['B7', 'R7', 'auc'], X5: ['B7', 'R14', 'auc'],
});
// the seal's value format: decimal places per feature (JavaScript toFixed)
export const PLACES = Object.freeze({
  Administrative: 0, Administrative_Duration: 1, Informational: 0, Informational_Duration: 1, ProductRelated: 0,
  ProductRelated_Duration: 1, BounceRates: 4, ExitRates: 4, PageValues: 2, SpecialDay: 1,
});

const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** the JSON seal inside a claims file's text (the first ```json block), or { ok: false } */
export function readSeal(text) {
  const m = typeof text === 'string' ? text.match(/```json\n([\s\S]*?)\n```/) : null;
  if (!m) return { ok: false, why: 'no sealed json block' };
  try {
    const seal = JSON.parse(m[1]);
    if (!seal || seal.test !== 'MULTIPLIER' || !Array.isArray(seal.promptP)) return { ok: false, why: 'not the multiplier seal' };
    return { ok: true, seal };
  } catch { return { ok: false, why: 'the sealed block is not JSON' }; }
}

/** the seal's sample: P[floor(k*|P|/100)] then N[floor(k*|N|/100)], k = 0..99, from the held-out rows in file order */
export function sampleRows(heldRows, y) {
  if (!Array.isArray(heldRows) || !y || typeof y.length !== 'number') return [];
  const P = heldRows.filter((i) => y[i] === 1), N = heldRows.filter((i) => y[i] === 0);
  if (P.length < PER_CLASS || N.length < PER_CLASS) return [];
  const pick = (xs) => Array.from({ length: PER_CLASS }, (_, k) => xs[Math.floor((k * xs.length) / PER_CLASS)]);
  return [...pick(P), ...pick(N)];
}

/** one feature value as the prompt shows it */
export function formatValue(feat, x) {
  const n = Number(x);
  return Number.isFinite(n) && Object.hasOwn(PLACES, feat) ? n.toFixed(PLACES[feat]) : '';
}

/** prompt P for one session ({feature: value}); with a book, the book trimmed, a blank line, then P */
export function promptFor(seal, session, book = null) {
  if (!seal || !Array.isArray(seal.promptP) || !session || typeof session !== 'object') return '';
  const p = seal.promptP.map((line) => String(line).replace(/\{(\w+)\}/g, (_, f) => formatValue(f, session[f]))).join('\n');
  return typeof book === 'string' ? book.trim() + '\n\n' + p : p;
}

/** the seal's parse rule: the first run of digits; 1 to 3 digits and 0..100 is the score, anything else is unparsed (null) */
export function parseReply(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\d+/);
  if (!m || m[0].length > 3) return null;
  const v = Number(m[0]);
  return v <= 100 ? v : null;
}

/** a model's label from its score: 1 when the score is 50 or more; an unparsed reply has no label (null) */
export const modelLabel = (score) => (score === null || score === undefined ? null : score >= 50 ? 1 : 0);
/** a model's score for AUC: an unparsed reply counts as 50 */
export const modelScore = (score) => (score === null || score === undefined ? 50 : score);

/** mulberry32: the seal's bootstrap stream */
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** balanced accuracy: the mean recall over the classes present; a null label is a miss */
export function balancedAccuracy(labels, y) {
  if (!Array.isArray(labels) || !Array.isArray(y) || labels.length !== y.length) return 0;
  const hit = [0, 0], tot = [0, 0];
  for (let i = 0; i < y.length; i++) {
    const c = y[i] === 1 ? 1 : 0;
    tot[c]++;
    if (labels[i] === c) hit[c]++;
  }
  const present = [0, 1].filter((c) => tot[c] > 0);
  return present.length ? present.reduce((s, c) => s + hit[c] / tot[c], 0) / present.length : 0;
}

/** the 95% interval of a list of differences: sorted element floor(0.025 B) and floor(0.975 B) */
export function interval(diffs) {
  if (!Array.isArray(diffs) || !diffs.length) return { lo: null, hi: null };
  const s = [...diffs].sort((a, b) => a - b);
  return { lo: s[Math.floor(0.025 * s.length)], hi: s[Math.floor(0.975 * s.length)] };
}

// an arm can be scored on a metric only if it carries that metric's list for every session
const covers = (arm, kind, n) => !!arm && Array.isArray(kind === 'auc' ? arm.scores : arm.labels) && (kind === 'auc' ? arm.scores : arm.labels).length === n;
const metric = (kind, arm, idx, y) => (kind === 'auc'
  ? auc(idx.map((i) => arm.scores[i]), idx.map((i) => y[i]))
  : balancedAccuracy(idx.map((i) => arm.labels[i]), idx.map((i) => y[i])));

/** paired, stratified bootstrap: each resample draws 100 purchase rows then 100 no-purchase rows; every pair on the same resample */
export function bootstrap(arms, y, { resamples = BOOT.resamples, seed = BOOT.seed, pairs = PAIRS } = {}) {
  const out = {};
  if (!arms || !Array.isArray(y)) return out;
  const pos = [], neg = [];
  y.forEach((v, i) => (v === 1 ? pos : neg).push(i));
  if (!pos.length || !neg.length) return out;
  for (const id of Object.keys(pairs)) out[id] = [];
  const r = mulberry32(seed);
  for (let b = 0; b < resamples; b++) {
    const idx = [];
    for (let k = 0; k < PER_CLASS; k++) idx.push(pos[Math.floor(r() * pos.length)]);
    for (let k = 0; k < PER_CLASS; k++) idx.push(neg[Math.floor(r() * neg.length)]);
    for (const [id, [a, m, kind]] of Object.entries(pairs)) {
      if (!covers(arms[a], kind, y.length) || !covers(arms[m], kind, y.length)) continue;
      out[id].push(metric(kind, arms[a], idx, y) - metric(kind, arms[m], idx, y));
    }
  }
  return out;
}

/**
 * the verdict. arms = { KF|K3|K1|R14|R7|B7: { scores: number[], labels: (0|1|null)[] } } over the sample, y = its labels,
 * parsed = { R14|R7|B7: number of replies read }. Returns every metric, each claim with its interval, and X6.
 */
export function judge(arms, y, parsed, boot = BOOT) {
  if (!arms || !Array.isArray(y) || !y.length || !parsed) return { ok: false, why: 'arms, labels and parse counts' };
  const all = y.map((_, i) => i);
  const aucs = {}, bals = {};
  for (const [name, arm] of Object.entries(arms)) {
    if (!arm || !Array.isArray(arm.scores) || arm.scores.length !== y.length) return { ok: false, why: `arm ${name} does not cover the sample` };
    aucs[name] = r6(metric('auc', arm, all, y));
    if (Array.isArray(arm.labels) && arm.labels.length === y.length) bals[name] = r6(metric('bal', arm, all, y));
  }
  const diffs = bootstrap(arms, y, boot);
  const claims = [];
  for (const [id, [a, m, kind]] of Object.entries(PAIRS)) {
    const table = kind === 'auc' ? aucs : bals;
    if (table[a] === undefined || table[m] === undefined || !diffs[id] || !diffs[id].length) { claims.push({ id, holds: false, why: 'an arm is missing' }); continue; }
    const diff = r6(table[a] - table[m]);
    const { lo, hi } = interval(diffs[id]);
    claims.push({ id, metric: kind, arm: a, minus: m, diff, lo: r6(lo), hi: r6(hi), holds: diff > 0 && lo > 0 });
  }
  const counts = MODEL_ARMS.map((a) => (Number.isInteger(parsed[a]) ? parsed[a] : 0));
  claims.push({ id: 'X6', parsed: Object.fromEntries(MODEL_ARMS.map((a, k) => [a, counts[k]])), min: PARSED_MIN, holds: counts.every((c) => c >= PARSED_MIN) });
  return { ok: true, auc: aucs, balancedAccuracy: bals, claims, multiplierProven: claims[0].holds === true };
}

export default { readSeal, sampleRows, formatValue, promptFor, parseReply, modelLabel, modelScore, mulberry32, balancedAccuracy, interval, bootstrap, judge };
