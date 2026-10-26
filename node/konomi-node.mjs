// ════════════════════════════════════════════════════════════════
// node/konomi-node.mjs — konomi-slm as a cell of the one body: the verified pattern library, answering on the estate's
// shared foundation (vendor/fall-kit-core, copied verbatim from fall-kit/core and pinned).
//
// Each verified domain is a skill. An ask is answered from that domain's pattern alone — VERIFIED with konomi-slm's
// own receipt (the asker re-hashes it), or ABSTAIN when no verified pattern covers the input. The node's genome is the
// seeds its patterns grew from; regrow() grows every pattern again from its seed and reports whether each comes back
// with the same pattern id (the grown rules are inside the id, so a different growth is a different id).
//
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { createNode } from '../vendor/fall-kit-core/node.mjs';
import { buildLibrary, buildPattern, answer } from '../konomi-slm.mjs';
import { decodeSeed } from '../vendor/seed-library/seedlib.mjs';

export const NAME = 'konomi-slm';

/** The genome of a library: the seed each verified pattern grew from, and the id it grew into. */
export function genomeOf(library) {
  const seeds = {}, patterns = {};
  for (const id of Object.keys(library.patterns).sort()) {
    const p = library.patterns[id];
    if (!p.verified) continue;
    seeds[id] = p.seedStr;
    patterns[id] = p.patternId;
  }
  return { kind: 'konomi-slm/seeds', seeds, patterns };
}

/** Grow every pattern again from the genome's seeds alone. → { ok, same, ids: { domain: [was, now] } } */
export function regrow(genome) {
  const ids = {};
  let same = true, n = 0;
  for (const domain of Object.keys((genome && genome.seeds) || {}).sort()) {
    const d = decodeSeed(genome.seeds[domain]);
    let now = null;
    if (d.ok && d.seed.domain === domain && d.seed.grow) {
      const r = buildPattern(domain, {}, { grow: d.seed.grow, seed: d.seed.seed });
      now = r.ok && r.pattern.seedStr === genome.seeds[domain] ? r.pattern.patternId : null;
    }
    ids[domain] = [genome.patterns[domain], now];
    if (now === null || now !== genome.patterns[domain]) same = false;
    n++;
  }
  return { ok: true, same: same && n > 0, ids };
}

/** Answer from one domain's pattern only, so a skill means one domain. */
const skillOf = (library, domain) => async (input) => {
  const one = { ...library, patterns: { [domain]: library.patterns[domain] } };
  const a = answer(one, input);
  return a.verdict === 'VERIFIED'
    ? { verdict: 'VERIFIED', domain: a.domain, label: a.label, confidence: a.confidence, receipt: a.receipt }
    : { verdict: 'ABSTAIN', why: a.why };
};

/**
 * Boot konomi-slm as a node: { identity, genesis, clock, budget, library? } (identity and genesis come from the mesh;
 * a library already built may be passed in, so a page does not grow it twice).
 */
export async function konomiNode({ identity, genesis, clock, budget, library = buildLibrary() } = {}) {
  const genome = genomeOf(library);
  const skills = {};
  for (const domain of Object.keys(genome.seeds)) skills[domain] = skillOf(library, domain);
  const node = await createNode({ name: NAME, identity, skills, genesis, clock, budget, genome });
  return { node, library, genome };
}
