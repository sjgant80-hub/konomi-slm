// tools/council.mjs — THE GATED COUNCIL. PewDiePie's council of LLMs voted on answers and eliminated the weakest,
// so the members learned to collude and game the vote. This one cannot: the council only PROPOSES; a deterministic,
// re-runnable held-out gate DISPOSES. There is no vote and no elimination-by-agent for a member to rig — a proposal
// either predicts data it never saw or it doesn't, and that fact is not an opinion a model can lobby. Collusion-proof
// by construction.
//
// Many local proposers (a swarm of models) + a model-free SEARCH member that is always present as the anchor: even if
// every model proposes garbage, search wins and the organ is still verified. Candidates are bred, the two best are
// cross-bred (a child kept only if it beats both parents), one monotone observer pass, then the single best by
// VALIDATION (carved from train, never the held-out test) is shipped with a scoreboard showing exactly which member won.
// Powered by the Konomi architecture, created by Thomas Frumkin.
import { deepen, patternFromGenome } from '../grow-tier.mjs';
import { stemGenome, splitRows, fit, scoreRow, auc, round6, encodeSeed, makeSeed, crossGenome, rng } from './../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from './../vendor/seed-library/sha256.mjs';
import { proposeGenome } from './propose-local.mjs';
import { patternBook } from './patternforge.mjs';

export const DEFAULT_COUNCIL = [
  { name: 'qwen14b', model: 'qwen2.5:14b' },
  { name: 'qwen7b', model: 'qwen2.5:7b' },
  { name: 'llama1b', model: 'llama3.2:1b' },
];
const CFG = { population: 44, elites: 6, generations: 44 };

export async function forgeWithCouncil(ds, { label1 = 'the positive outcome', seed = 7, cfg = CFG, council = DEFAULT_COUNCIL, provenance = 'the domain dataset' } = {}) {
  if (!ds || ds.ok === false) return { ok: false, error: 'the council needs a loaded dataset' };
  const inner = splitRows(ds, ds.trainRows, 0.25, seed);                 // validation carved from TRAIN, never the held-out test
  const valAuc = (g) => { const c = fit(ds, inner.rest, g); return round6(auc(inner.held.map((i) => scoreRow(c, ds, i)), inner.held.map((i) => ds.y[i]))); };
  const testAuc = (g) => patternFromGenome(ds, ds.name, g, seed).heldAuc;

  const candidates = [];
  // the SEARCH member — model-free, always present, the collusion-proof anchor
  candidates.push({ member: 'search (no model)', g: deepen(ds, inner.rest, seed + 1, cfg, [stemGenome()]), hypotheses: [] });
  // each council model proposes; keep both its raw proposal and a bred refinement of it
  for (const m of council) {
    const prop = m.propose ? await m.propose(ds) : await proposeGenome(ds, { model: m.model, label1 });  // m.propose overrides for tests
    if (!prop.ok) { candidates.push({ member: m.name, g: null, down: true, hypotheses: [] }); continue; }
    candidates.push({ member: m.name + ' (raw)', g: prop.genome, hypotheses: prop.hypotheses });
    candidates.push({ member: m.name + ' (bred)', g: deepen(ds, inner.rest, seed, cfg, [prop.genome]), hypotheses: prop.hypotheses });
  }

  // THE GATE DISPOSES: every live candidate scored on held-out-style validation. No vote.
  const live = candidates.filter((c) => c.g);
  for (const c of live) c.val = valAuc(c.g);
  let champ = live.reduce((a, b) => (b.val > a.val ? b : a));

  // cross-breed the two best — a child joins only by beating BOTH parents
  const top2 = [...live].sort((a, b) => b.val - a.val).slice(0, 2);
  if (top2.length === 2) {
    const child = crossGenome(top2[0].g, top2[1].g, rng(seed * 104729 + 5));
    const cv = valAuc(child);
    if (cv > top2[0].val && cv > top2[1].val) champ = { member: `cross-bred (${top2[0].member} × ${top2[1].member})`, g: child, val: cv, hypotheses: [] };
  }
  // one monotone observer pass
  const g2 = deepen(ds, inner.rest, seed + 2, cfg, [champ.g]);
  if (valAuc(g2) >= champ.val) champ = { member: champ.member + ' + observed', g: g2, val: valAuc(g2), hypotheses: champ.hypotheses };

  const pattern = patternFromGenome(ds, ds.name, champ.g, seed);
  const ownedSeed = encodeSeed(makeSeed({ domain: ds.name, seed, genome: champ.g }));
  const book = patternBook(ds.name, label1, pattern, provenance);
  const scoreboard = live.map((c) => ({ member: c.member, val: c.val, test: testAuc(c.g) })).sort((a, b) => b.val - a.val);
  const dropped = candidates.filter((c) => c.down).map((c) => c.member);
  const core = { model: 'konomi-slm/council', domain: ds.name, council: council.map((m) => m.name), winner: champ.member,
    heldAuc: pattern.heldAuc, heldAcc: pattern.heldAcc, held: pattern.held, ownedSeed, scoreboard, dropped };
  return { ok: true, ...core, book,
    receipt: { ...core, receiptHash: sha256Hex(JSON.stringify(core)) },
    collusionProof: 'The council only proposes; the deterministic held-out gate disposes. There is no vote and no elimination a member can influence, so no member can game or collude on the outcome — a proposal either predicts the unseen or it is not kept.',
    mindContext: `Verified patterns for ${ds.name} (predicting "${label1}"), chosen by a gated council:\n${book}` };
}
