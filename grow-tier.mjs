// grow-tier.mjs — THE LADDER's growth engine. Tier N builds tier N+1: the library grows, it is never trained.
//
// "Use the 1B to build the 2B" in this architecture does NOT mean train a bigger weight-set. It means GROW THE
// LIBRARY: deepen the patterns you have and broaden into new domains, each addition gated (predict held-out or be
// cut), BOOTSTRAPPED by the previous tier (tier N's champion genomes WARM-START tier N+1's search, so it starts
// from the best already found, not from zero). The one guarantee that makes a ladder trustworthy: MONOTONE — tier
// N+1 is never worse than tier N on any domain it already had; it only keeps a deepened pattern when it beats the
// old one on held-out, else it keeps the old one. So every rung provably dominates the last, with a receipt.
//
// "Take from frontier and improve via our framework" lives here too: a frontier/local model can PROPOSE a new
// domain or a candidate (imagination); growTier only keeps what the gate verifies on held-out — so what enters the
// library is owned and proven, never a fork. Pure, total, deterministic. Powered by the Konomi architecture (Thomas Frumkin).

import {
  germinate, fit, scoreRow, auc, heldAccuracy, makeSeed, encodeSeed, round6, utf8Bytes,
  assess, splitRows, mutateGenome, crossGenome, randomGenome, stemGenome, rng, draw, coin,
} from './vendor/seed-library/seedlib.mjs';
import { sha256Hex } from './vendor/seed-library/sha256.mjs';
import { loadDomain, DOMAIN_IDS, DOMAIN_META } from './vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS, EXT_META } from './domains-ext.mjs';
import { GATE_AUC, operatingThreshold, fingerprint } from './konomi-slm.mjs';

export const DEEPEN = { population: 44, elites: 6, generations: 44 };   // deeper than tier-1's DEFAULT_GROW

export function loadAny(name, ctx = {}) {
  if (DOMAIN_IDS.includes(name)) return loadDomain(name, ctx);
  if (EXT_IDS.includes(name)) return loadDomainExt(name);
  return { ok: false, error: 'unknown domain: ' + name };
}
const titleOf = (id) => (DOMAIN_META[id] || EXT_META[id] || {}).title || id;
const realOf = (id) => !!((DOMAIN_META[id] || EXT_META[id] || {}).real);
const seedNum = (id) => { let h = 7; for (const c of id) h = (h * 131 + c.charCodeAt(0)) >>> 0; return (h % 90000) + 1; };

// ── a warm-started GA: the population starts from `stems` (tier-N champions) + their mutations + randoms ──────
export function deepen(dataset, trainRows, seed, cfg, stems) {
  const inner = splitRows(dataset, trainRows, 1 / 3, seed);
  const r = rng(seed * 7919 + 1);
  let born = 0;
  const live = (g) => ({ g, n: born++, fitness: assess(dataset, inner, g) });
  const better = (a, b) => a.fitness > b.fitness || (a.fitness === b.fitness && a.n < b.n);
  const seeds = (Array.isArray(stems) && stems.length ? stems : [stemGenome()]);
  const warm = [];
  for (const s of seeds) { warm.push(s, mutateGenome(s, r), mutateGenome(s, r)); }
  let pop = [...warm, ...Array.from({ length: Math.max(0, cfg.population - warm.length) }, () => randomGenome(r))]
    .slice(0, Math.max(cfg.population, warm.length)).map(live);
  const best = () => pop.reduce((a, b) => (better(b, a) ? b : a));
  for (let gen = 1; gen < cfg.generations; gen++) {
    const battle = () => { const a = pop[draw(r, pop.length)], b = pop[draw(r, pop.length)]; return better(b, a) ? b : a; };
    const next = [...pop].sort((a, b) => (better(a, b) ? -1 : 1)).slice(0, cfg.elites);
    while (next.length < cfg.population) { const child = crossGenome(battle().g, battle().g, r); next.push(live(coin(r) ? mutateGenome(child, r) : child)); }
    pop = next;
  }
  return best().g;
}

// ── build a full pattern object (konomi-slm shape) from a FIXED champion genome (pins the evolved pattern) ────
export function patternFromGenome(dataset, domainId, genome, seed) {
  const scorecard = fit(dataset, dataset.trainRows, genome);
  const op = operatingThreshold(scorecard, dataset, dataset.trainRows);
  const dist = {};
  for (const f of dataset.features) dist[f] = fingerprint(dataset, dataset.trainRows, f);
  const scores = dataset.heldRows.map((i) => scoreRow(scorecard, dataset, i));
  const y = dataset.heldRows.map((i) => dataset.y[i]);
  const seedStr = encodeSeed(makeSeed({ domain: domainId, seed, genome }));   // fixed f: seed — the evolved pattern, pinned
  const rules = scorecard.rules.map((rr) => ({ feat: rr.feat, op: rr.op, v: rr.v, w: rr.w }));
  const p = {
    domain: domainId, title: titleOf(domainId), real: realOf(domainId), features: dataset.features.slice(),
    seedStr, rules, base: op.base, threshold: op.thr, spread: op.spread,
    heldAuc: round6(auc(scores, y)), heldAcc: heldAccuracy(scorecard, dataset, dataset.trainRows, dataset.heldRows),
    train: dataset.trainRows.length, held: dataset.heldRows.length, dist, verified: false,
  };
  p.verified = p.heldAuc >= GATE_AUC;
  p.patternId = sha256Hex(JSON.stringify({ d: domainId, s: seedStr, r: rules })).slice(0, 16);
  return p;
}

// ── GROW TIER N -> TIER N+1. prev = a konomi-slm library (buildLibrary output). Returns the next tier + receipt. ─
export function growTier(prev, { ctx = {}, newDomains = EXT_IDS, deepenCfg = DEEPEN } = {}) {
  if (!prev || !prev.patterns || !Array.isArray(prev.domains)) return { ok: false, error: 'growTier needs a tier-1 library' };
  const patterns = {}, seeds = {}, cut = [];

  // 1 · DEEPEN every existing domain, bootstrapped from tier-1's champion, kept only if it does not regress
  for (const id of prev.domains) {
    const ds = loadAny(id, ctx);
    if (ds.ok === false) { patterns[id] = prev.patterns[id]; seeds[id] = prev.seeds[id]; continue; }
    const g1 = germinate(ds, prev.seeds[id], { guard: true });
    const auc1 = g1.ok ? g1.heldAuc : (prev.patterns[id].heldAuc || 0);
    const champ = g1.ok ? g1.genome : stemGenome();
    const g2 = deepen(ds, ds.trainRows, seedNum(id) + 1, deepenCfg, [champ]);
    const cand = patternFromGenome(ds, id, g2, seedNum(id) + 1);
    let kept;
    if (cand.heldAuc >= auc1) { kept = cand; }                         // improved or equal -> take the deepened one
    else { kept = prev.patterns[id]; }                                  // MONOTONE GATE: never regress
    patterns[id] = kept; seeds[id] = kept.seedStr;
  }

  // 2 · BROADEN into new domains (polymath), each gated: verify on held-out or be cut
  for (const id of newDomains) {
    if (patterns[id]) continue;
    const ds = loadAny(id, ctx);
    if (ds.ok === false) { cut.push({ domain: id, why: ds.error }); continue; }
    const g = deepen(ds, ds.trainRows, seedNum(id), deepenCfg, [stemGenome()]);
    const p = patternFromGenome(ds, id, g, seedNum(id));
    if (p.verified) { patterns[id] = p; seeds[id] = p.seedStr; }
    else { cut.push({ domain: id, heldAuc: p.heldAuc, why: `held-out AUC ${p.heldAuc} below gate ${GATE_AUC}` }); }
  }

  const domains = Object.keys(patterns);
  let libraryBytes = 0, grownBytes = 0;
  for (const id of domains) { const p = patterns[id]; libraryBytes += utf8Bytes(p.seedStr); grownBytes += utf8Bytes(JSON.stringify({ rules: p.rules, base: p.base, threshold: p.threshold, dist: p.dist })); }
  const meanHeldAuc = domains.length ? round6(domains.reduce((a, d) => a + patterns[d].heldAuc, 0) / domains.length) : 0;

  return {
    ok: true, patterns, seeds, cut, domains,
    libraryBytes, grownBytes, ratio: libraryBytes > 0 ? round6(grownBytes / libraryBytes) : 0, meanHeldAuc,
  };
}

// ── the tier-over-tier receipt: proves the rung climbed and nothing regressed, content-hashed (tamper-evident) ─
export function tierReceipt(prev, next) {
  const perDomain = prev.domains.map((id) => ({ domain: id, tier1Auc: prev.patterns[id].heldAuc, tier2Auc: next.patterns[id] ? next.patterns[id].heldAuc : null }));
  const added = next.domains.filter((d) => !prev.domains.includes(d));
  const monotone = perDomain.every((d) => d.tier2Auc !== null && d.tier2Auc >= d.tier1Auc - 1e-9);
  const core = {
    model: 'konomi-slm/ladder', from: { domains: prev.domains.length, meanHeldAuc: prev.meanHeldAuc, libraryBytes: prev.libraryBytes },
    to: { domains: next.domains.length, meanHeldAuc: next.meanHeldAuc, libraryBytes: next.libraryBytes },
    added, perDomain, monotone, gateAuc: GATE_AUC,
  };
  return { ...core, receiptHash: sha256Hex(JSON.stringify(core)) };
}

export default { growTier, tierReceipt, deepen, patternFromGenome, loadAny, DEEPEN };
