// tools/evolution.mjs — EVOLUTION (queue #9). kard-evolve generalised: an organ's STRUCTURE evolves, with the gate
// as the fitness function. A population of configs (here: which features the organ is allowed to use) breeds across
// generations; fitness is held-out AUC — the witness/gate, not an opinion — so a variant survives only by predicting
// the unseen better. The best-ever is tracked and never regresses (monotone), and evolution can only ship a child
// that beats the all-features baseline. Precedent: U -> V (a version evolved fitter and shipped) on fallkard.
//
// Why it is not just the ladder: the ladder deepens a genome inside a FIXED feature set; evolution searches the
// SET itself — it can drop noisy features and find a smaller, fitter organ. Pure, total, deterministic (seeded).
// Reuses the seed-library ribosome, credited. Powered by the Konomi architecture, created by Thomas Frumkin.
import { grow, fit, scoreRow, auc, round6, rng, draw, coin } from './../vendor/seed-library/seedlib.mjs';

const GROW = { population: 16, elites: 3, generations: 12 };
const key = (feats) => [...feats].sort().join('|');

// fitness = held-out AUC of a genome grown using ONLY this config's features (the gate decides). cached per config.
export function fitness(dataset, feats, seed, growCfg, cache) {
  const k = key(feats);
  if (cache && cache.has(k)) return cache.get(k);
  const view = { ...dataset, features: feats };
  const g = grow(view, dataset.trainRows, seed, growCfg);
  const card = fit(view, dataset.trainRows, g.champion);
  const a = round6(auc(dataset.heldRows.map((i) => scoreRow(card, view, i)), dataset.heldRows.map((i) => dataset.y[i])));
  if (cache) cache.set(k, a);
  return a;
}

const uniq = (a) => [...new Set(a)];
export function mutateConfig(feats, all, r) {
  const out = feats.slice();
  if (coin(r) && out.length < all.length) { const add = all[draw(r, all.length)]; if (!out.includes(add)) out.push(add); }
  else if (out.length > 2) out.splice(draw(r, out.length), 1);
  return uniq(out.length >= 2 ? out : all.slice(0, 2));
}
export function crossConfig(a, b, r) {
  const set = uniq([...a.filter(() => coin(r)), ...b.filter(() => coin(r))]);
  return set.length >= 2 ? set : uniq([...a, ...b]).slice(0, Math.max(2, Math.ceil((a.length + b.length) / 2)));
}

export function evolve(dataset, { generations = 6, population = 8, growCfg = GROW, seed = 7 } = {}) {
  if (!dataset || dataset.ok === false || !dataset.features) return { ok: false, error: 'evolve needs a loaded dataset' };
  const all = dataset.features, cache = new Map(), r = rng(seed * 2654435761 >>> 0);
  const baseline = fitness(dataset, all, seed, growCfg, cache);          // all features = the config to beat
  const randSubset = () => { const s = [...all].map((f) => [f, r()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]); return s.slice(0, 2 + draw(r, Math.max(1, all.length - 1))); };
  let pop = [all, ...Array.from({ length: population - 1 }, randSubset)];
  let best = { feats: all, auc: baseline }, curve = [];
  for (let gen = 0; gen < generations; gen++) {
    const scored = pop.map((f) => ({ f, a: fitness(dataset, f, seed, growCfg, cache) })).sort((x, y) => y.a - x.a || x.f.length - y.f.length);
    if (scored[0].a > best.auc || (scored[0].a === best.auc && scored[0].f.length < best.feats.length)) best = { feats: scored[0].f, auc: scored[0].a };
    curve.push(best.auc);
    const elites = scored.slice(0, Math.max(2, Math.ceil(population / 3))).map((s) => s.f);
    const next = elites.slice();
    while (next.length < population) { const a = elites[draw(r, elites.length)], b = elites[draw(r, elites.length)]; next.push(coin(r) ? mutateConfig(crossConfig(a, b, r), all, r) : mutateConfig(a, all, r)); }
    pop = next;
  }
  return {
    ok: true, domain: dataset.name, generations, allFeatures: all.length,
    baselineAuc: baseline, evolvedAuc: best.auc, lift: round6(best.auc - baseline),
    evolvedFeatures: best.feats.slice().sort(), keptOf: `${best.feats.length}/${all.length}`,
    curve, improved: best.auc > baseline + 1e-9,
  };
}

export default { fitness, mutateConfig, crossConfig, evolve };
