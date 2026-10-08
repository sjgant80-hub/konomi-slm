// tools/cortex.mjs — THE RUNNING CORTEX. Boots the whole body on whatever host it's on and assembles the cognition
// stack into ONE running thing: the verified pattern-library (the organs), the neuron map, the synapse graph, the
// last sleep fold, the evolution state — plus the host's model tier. think() is the body's single entry: it routes an
// input to a verified organ and answers, or abstains. At laptop scale this is the real small cortex; the same boot
// sizes up on a 512 GB box (see body.mjs). Pure where it can be; boot reads the shipped state artifacts. Deterministic.
// Powered by the Konomi architecture, created by Thomas Frumkin.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLibrary, answer } from '../konomi-slm.mjs';
import { growTier } from '../grow-tier.mjs';
import { DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { EXT_IDS } from '../domains-ext.mjs';
import { body } from './body.mjs';

const dir = fileURLToPath(new URL('../pattern-books/', import.meta.url));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(dir + f, 'utf8')); } catch { return null; } };

// boot the running cortex on this host. The library is the full body: the vendored domains germinate live from seeds,
// and the extended domains fold in through grow-tier (the same loader the tiers use), so the organ count here matches
// the neuron map rather than only the four live-seeded ones.
export function boot(ctx = {}) {
  const b = body();
  let lib = buildLibrary([...DOMAIN_IDS], ctx);      // the vendored organs, germinated live
  try {
    const full = growTier(lib, { ctx, newDomains: EXT_IDS }); // fold the extended organs in through the tier loader
    if (full && full.ok && (full.domains || []).length >= (lib.domains || []).length) lib = full;
  } catch { /* if an ext organ can't load on this host, keep the live-seeded library — never fake an organ */ }
  return {
    ok: true, booted: true,
    host: b.host, tier: b.cortex.tier, model: b.cortex.model, isCortexBox: b.isCortexBox,
    library: lib,
    neurons: readJson('neurons.json'), synapses: readJson('synapses.json'),
    sleep: readJson('sleep.json'), evolution: readJson('evolution.json'),
  };
}

// the body's single entry: route to a verified organ and answer, or abstain (the gate). think is the whole stack answering.
export function think(cortex, input) {
  if (!cortex || !cortex.library) return { ok: false, error: 'cortex not booted' };
  return answer(cortex.library, input);
}

// a compact status of the running body
export function status(cortex) {
  const lib = cortex.library || {};
  return {
    host: cortex.host.host, ram: cortex.host.ramGB, tier: cortex.tier, model: cortex.model, isCortexBox: cortex.isCortexBox,
    organs: (lib.domains || []).length, libraryBytes: lib.libraryBytes || 0, meanHeldAuc: lib.meanHeldAuc || 0,
    neurons: cortex.neurons ? cortex.neurons.populated : 0, neuronsVerified: cortex.neurons ? cortex.neurons.verified : 0,
    synapses: cortex.synapses ? cortex.synapses.edges.length : 0,
    sleepRecallHeld: cortex.sleep ? cortex.sleep.recallHeld : null,
    evolutionImproved: cortex.evolution ? cortex.evolution.improved : 0,
    live: true,
  };
}

export default { boot, think, status };
