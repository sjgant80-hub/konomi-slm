// konomi-slm.mjs — THE KONOMI SLM · the inversion.
//
// Current SLMs shrink a big model (quantize/distil) until accuracy falls off a cliff: the model IS the
// knowledge, so compressing the model loses the knowledge. The Konomi SLM inverts this. Knowledge lives in a
// VERIFIED, READABLE PATTERN-LIBRARY — each pattern predicts held-out cases it never saw, or it is CUT — and a
// genuinely small model does only IMAGINATION/ROUTING. Shrinking the model loses nothing, because the knowledge
// is in the library. The library is stored as tiny Konomi seeds (knowledge-in-seeds-not-weights), the gate
// guarantees fidelity (answer from a verified pattern or ABSTAIN — no hallucination), and every answer carries a
// tamper-evident receipt naming the pattern that fired and the held-out score that earns it.
//
// HONEST SCOPE. v1 proves the ARCHITECTURE on structured-prediction domains, where "predict held-out or die" is
// measurable. The verified patterns are interpretable scorecards (seed-library's ribosome, vendored + credited),
// not free-form text generation. The "small model does imagination" layer (free text -> which domain + a feature
// reading) is OPTIONAL and kept OUT of everything graded here — exactly seed-library's line. The defensible claim
// is "beats a flat model on any domain it has a verified pattern for, and refuses instead of hallucinating on
// anything it does not" — NOT "beats GPT at everything". Breadth grows as the library grows (RSI).
//
// Lineage, credited: the grow->fit->grade-on-held-out ribosome, the seeded RNG, the stratified split and the AUC
// are seed-library / fall-spore / pattern-organs (sjgant80-hub), vendored verbatim under ./vendor and reused.
// Powered by the Konomi architecture, created by Thomas Frumkin. Every exported entry point is pure, total and
// deterministic: hostile input returns {ok:false} or an ABSTAIN, never throws, never a clock/rng/network.

import {
  makeSeed, encodeSeed, decodeSeed, germinate, fit, fires, round6, utf8Bytes, quantile,
} from './vendor/seed-library/seedlib.mjs';
import { loadDomain, DOMAIN_IDS, DOMAIN_META } from './vendor/seed-library/domains.mjs';
import { sha256Hex } from './vendor/seed-library/sha256.mjs';

// ── fidelity constants (the gate's thresholds — published, not hidden) ───────────────────────────────────────
export const GATE_AUC = 0.60;    // a pattern earns a place in the library only if held-out AUC >= this
export const ROUTE_MIN = 0.35;   // below this geometric membership, the input is out-of-distribution -> ABSTAIN
export const DEFAULT_GROW = { population: 24, elites: 4, generations: 16 };

// ── a feature's distribution on the TRAIN rows: the shape the router measures proximity to (deterministic) ────
export function fingerprint(dataset, rows, feat) {
  const q = (p) => round6(quantile(dataset, feat, rows, p));
  const xs = rows.map((i) => dataset.cols[feat][i]);
  const min = xs.length ? xs.reduce((a, b) => Math.min(a, b), Infinity) : 0;
  const max = xs.length ? xs.reduce((a, b) => Math.max(a, b), -Infinity) : 0;
  return { min: round6(min), q1: q(0.25), med: q(0.5), q3: q(0.75), max: round6(max) };
}

// membership of a value in a feature's distribution: 1 inside the IQR, decaying smoothly outside it. Total.
export function membership(value, fp) {
  const x = Number(value);
  if (!fp || !Number.isFinite(x)) return 0;
  if (x >= fp.q1 && x <= fp.q3) return 1;
  const iqr = Math.max(fp.q3 - fp.q1, 0);
  const span = Math.max(iqr, (fp.max - fp.min) * 0.5, 1e-9);
  const d = x < fp.q1 ? fp.q1 - x : x - fp.q3;
  return round6(Math.exp(-d / span));  // 1 at the IQR edge, ->0 far outside
}

// ── the operating threshold a scorecard uses to turn a score into a 0/1 label (from TRAIN, seed-library's rule) ─
function scoreRowLocal(scorecard, dataset, i) {
  let s = 0;
  for (const rule of scorecard.rules) if (fires(rule, dataset.cols[rule.feat][i])) s += rule.w;
  return s;
}
export function operatingThreshold(scorecard, dataset, trainRows) {
  const base = trainRows.length ? trainRows.reduce((a, i) => a + dataset.y[i], 0) / trainRows.length : 0;
  const ts = trainRows.map((i) => scoreRowLocal(scorecard, dataset, i)).sort((a, b) => a - b);
  const thr = ts.length ? ts[Math.min(ts.length - 1, Math.floor((1 - base) * ts.length))] : 0;
  const spread = ts.length ? Math.max(ts[ts.length - 1] - ts[0], 1e-9) : 1;
  return { thr: round6(thr), base: round6(base), spread: round6(spread) };
}

// score a FREE input dict (not a dataset row) against a fitted scorecard. Total.
export function scoreInput(scorecard, input) {
  let s = 0;
  if (!scorecard || !Array.isArray(scorecard.rules) || !input || typeof input !== 'object') return 0;
  for (const rule of scorecard.rules) {
    const x = Number(input[rule.feat]);
    if (Number.isFinite(x) && fires(rule, x)) s += rule.w;
  }
  return round6(s);
}

// ── BUILD ONE PATTERN: germinate a grow-seed on a domain, fit the champion, keep its held-out score + shape ────
export function buildPattern(domainId, ctx = {}, { grow = DEFAULT_GROW, seed = 7 } = {}) {
  const dataset = loadDomain(domainId, ctx);
  if (!dataset || dataset.ok === false) return { ok: false, error: (dataset && dataset.error) || 'domain did not load' };
  const seedObj = makeSeed({ domain: domainId, seed, grow });
  const seedStr = encodeSeed(seedObj);
  const g = germinate(dataset, seedStr, { guard: true });
  if (!g.ok) return { ok: false, error: g.error };
  const scorecard = fit(dataset, dataset.trainRows, g.genome);
  const op = operatingThreshold(scorecard, dataset, dataset.trainRows);
  const dist = {};
  for (const f of dataset.features) dist[f] = fingerprint(dataset, dataset.trainRows, f);
  const pattern = {
    domain: domainId,
    title: (DOMAIN_META[domainId] && DOMAIN_META[domainId].title) || domainId,
    real: !!(DOMAIN_META[domainId] && DOMAIN_META[domainId].real),
    features: dataset.features.slice(),
    seedStr,                                         // the genome travels inside the seed — the library IS the seeds
    rules: scorecard.rules.map((r) => ({ feat: r.feat, op: r.op, v: r.v, w: r.w })),
    base: op.base,
    threshold: op.thr,
    spread: op.spread,
    heldAuc: g.heldAuc,
    heldAcc: g.heldAcc,
    train: g.train,
    held: g.held,
    dist,
    verified: g.heldAuc >= GATE_AUC,
  };
  pattern.patternId = sha256Hex(JSON.stringify({ d: domainId, s: seedStr, r: pattern.rules })).slice(0, 16);
  return { ok: true, pattern };
}

// ── BUILD THE LIBRARY: a verified pattern per domain. Unverified domains are CUT (the gate: predict or die). ───
export function buildLibrary(domainIds = DOMAIN_IDS, ctx = {}, opts = {}) {
  const patterns = {}, cut = [], seeds = {};
  let grownBytes = 0, libraryBytes = 0;
  for (const id of domainIds) {
    const r = buildPattern(id, ctx, opts);
    if (!r.ok) { cut.push({ domain: id, why: r.error }); continue; }
    const p = r.pattern;
    if (!p.verified) { cut.push({ domain: id, heldAuc: p.heldAuc, why: `held-out AUC ${p.heldAuc} below gate ${GATE_AUC}` }); continue; }
    patterns[id] = p;
    seeds[id] = p.seedStr;
    libraryBytes += utf8Bytes(p.seedStr);
    grownBytes += utf8Bytes(JSON.stringify({ rules: p.rules, base: p.base, threshold: p.threshold, dist: p.dist }));
  }
  const verified = Object.keys(patterns);
  return {
    ok: verified.length > 0,
    patterns, seeds, cut,
    domains: verified,
    libraryBytes, grownBytes,
    ratio: libraryBytes > 0 ? round6(grownBytes / libraryBytes) : 0,
    meanHeldAuc: verified.length ? round6(verified.reduce((a, d) => a + patterns[d].heldAuc, 0) / verified.length) : 0,
  };
}

// ── THE ROUTER (geometric retrieval): which verified pattern does this input fit, and how well? Total. ────────
export function route(library, input) {
  if (!library || !library.patterns || !input || typeof input !== 'object') return { ok: false, best: null, ranked: [] };
  const ranked = [];
  for (const id of Object.keys(library.patterns)) {
    const p = library.patterns[id];
    const present = p.features.filter((f) => Number.isFinite(Number(input[f])));
    const coverage = p.features.length ? present.length / p.features.length : 0;
    let member = 0;
    if (coverage === 1) {
      member = p.features.reduce((a, f) => a + membership(input[f], p.dist[f]), 0) / p.features.length;
    }
    ranked.push({ domain: id, coverage: round6(coverage), routeScore: round6(coverage === 1 ? member : 0) });
  }
  ranked.sort((a, b) => b.routeScore - a.routeScore || (a.domain < b.domain ? -1 : 1));
  return { ok: true, best: ranked[0] || null, ranked };
}

// ── THE SLM CALL: route -> gate -> answer from a verified pattern, or ABSTAIN. Receipt on every answer. ───────
export function answer(library, input) {
  const r = route(library, input);
  if (!r.ok || !r.best) return { ok: true, verdict: 'ABSTAIN', why: 'malformed input — no features to route on', routeScore: 0 };
  const best = r.best;
  if (best.routeScore < ROUTE_MIN) {
    return { ok: true, verdict: 'ABSTAIN', why: 'out of distribution — no verified pattern covers this input', domain: best.domain, routeScore: best.routeScore };
  }
  const p = library.patterns[best.domain];
  if (!p || !p.verified) {
    return { ok: true, verdict: 'ABSTAIN', why: 'the matched domain has no verified pattern', domain: best.domain, routeScore: best.routeScore };
  }
  const score = scoreInput(p, input);
  const label = score > p.threshold ? 1 : 0;
  const margin = round6(Math.min(1, Math.abs(score - p.threshold) / (p.spread || 1)));
  const receiptCore = {
    model: 'konomi-slm/1',
    domain: p.domain, patternId: p.patternId,
    heldAuc: p.heldAuc, heldAcc: p.heldAcc, held: p.held, gateAuc: GATE_AUC,
    routeScore: best.routeScore, score, threshold: p.threshold,
    label, verdict: 'VERIFIED',
  };
  const receipt = { ...receiptCore, receiptHash: sha256Hex(JSON.stringify(receiptCore)) };
  return { ok: true, verdict: 'VERIFIED', domain: p.domain, label, confidence: margin, routeScore: best.routeScore, receipt };
}

// re-hash a receipt to catch tampering (tamper-evident; a changed field or score flips it). Total.
export function verifyReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || typeof receipt.receiptHash !== 'string') return { ok: false, genuine: false, why: 'not a receipt' };
  const { receiptHash, ...core } = receipt;
  const recomputed = sha256Hex(JSON.stringify(core));
  return { ok: true, genuine: recomputed === receiptHash, recomputed };
}

// ── IMAGINATION (optional, UNGRADED): a deterministic keyword proposer, standing in for the small model that
//    reads free text -> a candidate domain. It only PROPOSES; the gate (route+verify) decides. Never graded. ──
const IMAGINATION_HINTS = {
  shopper: ['shop', 'cart', 'purchase', 'session', 'visit', 'bounce', 'checkout', 'product'],
  triage: ['triage', 'patient', 'spo2', 'oxygen', 'heart', 'bp', 'fever', 'resp', 'vitals', 'emergency'],
  water: ['water', 'ph', 'turbidity', 'chlorine', 'ecoli', 'potable', 'drink', 'tds'],
  crop: ['crop', 'soil', 'plant', 'harvest', 'nitrogen', 'frost', 'rain', 'moisture', 'field'],
};
export function imagine(text, library = null) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, graded: false, why: 'imagination needs text' };
  const t = text.toLowerCase();
  const scored = Object.keys(IMAGINATION_HINTS).map((d) => ({
    domain: d, hits: IMAGINATION_HINTS[d].filter((w) => t.includes(w)).length,
  })).sort((a, b) => b.hits - a.hits || (a.domain < b.domain ? -1 : 1));
  const top = scored[0];
  const available = !library || !library.patterns ? true : !!library.patterns[top.domain];
  return {
    ok: true, graded: false, proposal: top.hits > 0 ? top.domain : null, ranked: scored, availableInLibrary: available,
    note: 'IMAGINATION ONLY — a proposal, not an answer. The gate (route + verified pattern) decides; nothing here is graded.',
  };
}

export default { GATE_AUC, ROUTE_MIN, buildPattern, buildLibrary, route, answer, verifyReceipt, imagine, scoreInput, membership };
