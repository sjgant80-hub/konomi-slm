// tools/body.mjs — THE BODY (queue #10). The cortex is hardware-aware: it reads the host it is actually on, sizes the
// model to the real RAM, and stands up the cognition stack (pattern-library + the 127 neuron addresses + synapses +
// sleep + evolution). The SAME code runs the real small cortex on a laptop and the full cortex on a 512 GB box — only
// the model tier changes. The body = this cortex + the didy-neurons that join it over the mesh (the 127-address map);
// neuron-nodes are tiny, so a box is bounded by the model it can hold, not the neurons.
//
// HONEST: model sizes/hardware are the published figures (see model-wishlist), a PLAN for the box, not a measured run.
// The cortex software is real and runs here; the big model only runs where the RAM exists. Pure, total, deterministic.
// Powered by the Konomi architecture, created by Thomas Frumkin.
import os from 'node:os';
import { ADDRESS_SPACE } from './neurons.mjs';
export { ADDRESS_SPACE };

// the sizer ladder — first tier whose RAM floor the host meets (figures: Unsloth / GLM-5.3 published, 2026-09-30)
export const TIERS = [
  { min: 512, tier: 'cortex-XL', model: 'GLM-5.3 (full), 4-bit ≈ 372–475 GB', note: 'the full cortex — frontier-class, owned' },
  { min: 256, tier: 'cortex-L', model: 'GLM-5.3 (full), 2-bit ≈ 239 GB  ·  or Flash 4-bit', note: 'full model at 2-bit, or Flash headroom' },
  { min: 180, tier: 'cortex-M', model: 'GLM-5.3-Flash, 4-bit ≈ 200 GB', note: 'the recommended first box (biggest 4-bit that fits)' },
  { min: 100, tier: 'cortex-S', model: 'GLM-5.3-Flash, 2-bit ≈ 109 GB', note: 'Flash at 2-bit' },
  { min: 24, tier: 'workstation', model: 'a 32–70B local model (e.g. qwen2.5:32b/72b)', note: 'serious local, no frontier box yet' },
  { min: 0, tier: 'edge', model: 'qwen2.5:14b (≈9 GB) / qwen2.5:7b / llama3.2:1b', note: 'laptop — the real small cortex runs here' },
];

export function hostProfile() {
  return { host: os.hostname(), platform: os.platform() + ' ' + os.arch(), cpus: os.cpus().length, ramGB: Math.round(os.totalmem() / 1073741824 * 10) / 10 };
}
export function sizeModel(ramGB) { return TIERS.find((t) => ramGB >= t.min) || TIERS[TIERS.length - 1]; }

// the cortex plan for a host of `ramGB`: model tier, how much of the body it can host, and the exact bring-up.
export function cortexPlan(ramGB) {
  const t = sizeModel(ramGB);
  const bringUp = [
    t.min >= 100 ? `ollama pull glm-5.3${t.min >= 512 ? '' : '-flash'}   # ${t.model}` : `# model already local: ${t.model}`,
    'node tools/run-neurons.mjs      # populate the 127-address neuron map',
    'node tools/run-synapses.mjs     # wire the organs into one mind',
    'node tools/run-sleep.mjs        # nightly consolidation (cron this)',
    'node tools/run-evolution.mjs    # let the organs evolve',
    'node tools/body.mjs             # bring the cortex up and report capacity',
  ];
  return {
    ramGB, tier: t.tier, model: t.model, note: t.note,
    neuronAddresses: ADDRESS_SPACE,
    hostsFullMap: ramGB >= 24,                  // the 127 neurons are tiny — any real machine holds the whole map
    runsFrontierModel: ramGB >= 100,            // the big GLM model needs a cortex box
    bringUp,
  };
}

// a one-call status for whatever host this actually is
export function body() {
  const h = hostProfile();
  const plan = cortexPlan(h.ramGB);
  return { host: h, cortex: plan, isCortexBox: h.ramGB >= 100 };
}

export default { hostProfile, sizeModel, cortexPlan, body, TIERS, ADDRESS_SPACE };
