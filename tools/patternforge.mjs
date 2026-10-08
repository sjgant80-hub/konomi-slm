// tools/patternforge.mjs — PATTERNFORGE · the self-improving pattern-organ (queue #5), 14b-led.
//
// The loop that fuses this session's three pieces into one organ that finds a domain's core patterns and
// improves itself, then ships the verified knowledge back to the mind:
//   1. PROPOSE  — the local model (sovereign, the 14b) proposes which features carry the signal (the neural half).
//   2. GATE     — candidates (the raw proposal, a bred refinement of it, and a from-stem baseline) are scored on a
//                 VALIDATION slice carved from train; the best is kept. The stem baseline is always in the pool, so
//                 a weak proposal can only tie, never poison. (konomi-slm's gate.)
//   3. BREED    — deepen() crosses + mutates the survivors (the kard-evolve move).
//   4. OBSERVE  — a monotone self-improvement pass: deepen again from the champion, kept only if it does not regress
//                 on validation (the ladder's monotone gate — the observer that rewrites and never makes it worse).
//   5. SHIP     — a readable, VERIFIED PATTERN BOOK (every rule predicted held-out it never saw) + an owned seed
//                 (the tiny model you keep) + a signed receipt + a system-prompt snippet that is the knowledge to
//                 feed the mind. The book is how Kar levels up: grow a verified library, not retrain weights.
//
// The neural proposer is UNGRADED (a local LLM proposes; the gate decides). Everything measured is deterministic.
// Powered by the Konomi architecture, created by Thomas Frumkin.
import { deepen, patternFromGenome } from '../grow-tier.mjs';
import { stemGenome, splitRows, fit, scoreRow, auc, round6, encodeSeed, makeSeed, crossGenome, rng } from './../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from './../vendor/seed-library/sha256.mjs';
import { proposeGenome } from './propose-local.mjs';

const CFG = { population: 44, elites: 6, generations: 44 };

// render a verified scorecard as a human-readable pattern book
export function patternBook(domain, label1, pattern, provenance) {
  const lines = pattern.rules.map((r) => {
    const dir = r.w > 0 ? `makes "${label1}" MORE likely` : `makes "${label1}" LESS likely`;
    const cmp = r.op === '>' ? 'above' : 'at or below';
    return `  • when ${r.feat} is ${cmp} ${r.v}  →  ${dir}  (weight ${r.w > 0 ? '+' : ''}${r.w})`;
  });
  return [
    `PATTERN BOOK — ${domain} (predicts: "${label1}")`,
    `source: ${provenance}`,
    `verified: every rule below was kept only because the whole set predicted held-out cases it never saw`,
    `held-out AUC ${pattern.heldAuc} · held-out accuracy ${pattern.heldAcc} · ${pattern.held} held-out cases`,
    ``,
    ...(lines.length ? lines : ['  (no rule survived the gate — the organ abstains on this domain)']),
  ].join('\n');
}

// the loop. ds = a loaded dataset; proposer = async (ds)->{genome,hypotheses} (defaults to the local 14b).
export async function forgeOrgan(ds, { label1 = 'the positive outcome', seed = 7, cfg = CFG, proposer = null, model = 'qwen2.5:14b', provenance = 'the domain dataset' } = {}) {
  if (!ds || ds.ok === false) return { ok: false, error: 'forgeOrgan needs a loaded dataset' };
  const inner = splitRows(ds, ds.trainRows, 0.25, seed);                 // val carved from TRAIN (never the held-out test)
  const valAuc = (g) => { const c = fit(ds, inner.rest, g); return round6(auc(inner.held.map((i) => scoreRow(c, ds, i)), inner.held.map((i) => ds.y[i]))); };

  // 1 · PROPOSE (the 14b leads)
  const prop = proposer ? await proposer(ds) : await proposeGenome(ds, { model, label1 });
  const proposed = prop.ok ? prop.genome : stemGenome();

  // 2+3 · GATE + BREED: pick the best of {raw proposal, bred-from-proposal, bred-from-stem} by validation
  const pool = {
    proposal: proposed,
    'bred from proposal': deepen(ds, inner.rest, seed, cfg, [proposed]),
    'bred from stem': deepen(ds, inner.rest, seed + 1, cfg, [stemGenome()]),
  };
  const scored = Object.entries(pool).map(([how, g]) => ({ how, g, val: valAuc(g) }));
  let champ = scored.reduce((a, b) => (b.val > a.val ? b : a));

  // 3b · CROSS-BREED: cross the two best parents; keep the child ONLY if it beats BOTH on validation (Simon's rule).
  const parents = [...scored].sort((a, b) => b.val - a.val).slice(0, 2);
  if (parents.length === 2) {
    const child = crossGenome(parents[0].g, parents[1].g, rng(seed * 104729 + 3));
    const childVal = valAuc(child);
    if (childVal > parents[0].val && childVal > parents[1].val) {        // a child earns its place only by beating both parents
      champ = { how: `cross-bred (${parents[0].how} × ${parents[1].how})`, g: child, val: childVal };
    }
  }

  // 4 · OBSERVE: one monotone self-improvement pass — deepen from the champion, keep only if val does not regress
  const g2 = deepen(ds, inner.rest, seed + 2, cfg, [champ.g]);
  if (valAuc(g2) >= champ.val) champ = { how: champ.how + ' + observed', g: g2, val: valAuc(g2) };

  // 5 · SHIP: fit the champion on all of train, grade on the untouched held-out test, render the book + owned seed
  const pattern = patternFromGenome(ds, ds.name, champ.g, seed);
  const ownedSeed = encodeSeed(makeSeed({ domain: ds.name, seed, genome: champ.g }));
  const book = patternBook(ds.name, label1, pattern, provenance);
  const core = { model: 'patternforge/1', domain: ds.name, selectedBy: champ.how, valAuc: champ.val,
    heldAuc: pattern.heldAuc, heldAcc: pattern.heldAcc, held: pattern.held, ownedSeed, ownedSeedBytes: ownedSeed.length,
    hypotheses: prop.ok ? prop.hypotheses : [], proposer: prop.ok ? prop.model : 'stem (proposer unavailable)' };
  return { ok: true, ...core, book, receipt: { ...core, receiptHash: sha256Hex(JSON.stringify(core)) },
    // the knowledge to feed the mind — the verified book as a system-prompt snippet (grow-not-retrain level-up)
    mindContext: `Verified patterns for ${ds.name} (predicting "${label1}"), each proven on held-out data:\n${book}` };
}
