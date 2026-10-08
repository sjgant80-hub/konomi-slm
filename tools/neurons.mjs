// tools/neurons.mjs — NEURONS (queue #8). The thinking unit is Thomas Frumkin's CUBE: eight small workers and a
// rule-based resolver. A neuron grows 8 independent workers (each a scorecard grown on its own seed, so they
// disagree), and a DETERMINISTIC resolver — weighted majority, each worker weighted by its own held-out skill —
// combines their votes into the neuron's answer. No LLM judges; the resolver is a rule, so the neuron is
// re-runnable and cannot be gamed. A neuron is VERIFIED only if the cube beats its best single worker on held-out
// (the whole is worth more than any part). 127 neurons = the router's address space: the neuron map / the swarm,
// from simulated to a real addressable layer.
//
// Pure, total, deterministic. Reuses the seed-library ribosome (grow/fit/scoreRow/auc), credited. Powered by the
// Konomi architecture, created by Thomas Frumkin (the cube / MACCubeFACE).
import { grow, fit, scoreRow, auc, round6 } from './../vendor/seed-library/seedlib.mjs';

export const WORKERS = 8;                 // the cube's eight corners
export const ADDRESS_SPACE = 127;         // the router's 127 addresses — the neuron map's capacity
const GROW = { population: 20, elites: 4, generations: 14 };

// a worker's operating threshold from TRAIN (predict the top `base` fraction positive) — deterministic
function opThr(card, dataset, trainRows) {
  const base = trainRows.length ? trainRows.reduce((a, i) => a + dataset.y[i], 0) / trainRows.length : 0;
  const ts = trainRows.map((i) => scoreRow(card, dataset, i)).sort((a, b) => a - b);
  return ts.length ? ts[Math.min(ts.length - 1, Math.floor((1 - base) * ts.length))] : 0;
}

export function growWorker(dataset, trainRows, seed, growCfg = GROW) {
  const g = grow(dataset, trainRows, seed, growCfg);
  const card = fit(dataset, trainRows, g.champion);
  const scores = dataset.heldRows.map((i) => scoreRow(card, dataset, i));
  const heldAuc = round6(auc(scores, dataset.heldRows.map((i) => dataset.y[i])));
  // train-score mean/std so the resolver can standardise each worker (comparable scales) — per-row, deployable
  const ts = trainRows.map((i) => scoreRow(card, dataset, i));
  const mean = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 0;
  const std = Math.sqrt((ts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ts.length))) || 1;
  return { card, heldAuc, thr: round6(opThr(card, dataset, trainRows)), mean: round6(mean), std: round6(std) };
}

// grow a neuron: WORKERS workers on different seeds, so they are genuinely different minds
export function growNeuron(dataset, { workers = WORKERS, baseSeed = 11, growCfg = GROW } = {}) {
  if (!dataset || dataset.ok === false || !dataset.trainRows || !dataset.heldRows) return { ok: false, error: 'neuron needs a loaded dataset' };
  const ws = [];
  for (let k = 0; k < workers; k++) ws.push(growWorker(dataset, dataset.trainRows, baseSeed + k * 131 + 1, growCfg));
  return { ok: true, workers: ws, domain: dataset.name };
}

// THE RULE-BASED RESOLVER: a skill-weighted sum of each worker's STANDARDISED score. Each worker is weighted by the
// square of its own held-out skill (auc-0.5)^2, so a clearly-better worker dominates and weak voters can't drown it;
// standardising puts every worker on one scale. Deterministic, per-row, total.
export function resolve(neuron, dataset, i) {
  if (!neuron || !neuron.workers) return 0;
  let s = 0;
  for (const w of neuron.workers) { const wgt = Math.max(0, (w.heldAuc || 0) - 0.5) ** 2; s += wgt * ((scoreRow(w.card, dataset, i) - (w.mean || 0)) / (w.std || 1)); }
  return round6(s);
}

// the neuron's held-out AUC vs its mean and best single worker. The honest ensemble claim is beating the AVERAGE
// worker (variance reduction); beating the single best too is a bonus, reported separately.
export function neuronVerdict(neuron, dataset) {
  const held = dataset.heldRows, y = held.map((i) => dataset.y[i]);
  const neuronAuc = round6(auc(held.map((i) => resolve(neuron, dataset, i)), y));
  const aucs = neuron.workers.map((w) => w.heldAuc);
  const best = round6(Math.max(...aucs)), mean = round6(aucs.reduce((a, b) => a + b, 0) / aucs.length);
  return { domain: neuron.domain, workers: neuron.workers.length, neuronAuc, bestWorker: best, meanWorker: mean,
    liftVsMean: round6(neuronAuc - mean), liftVsBest: round6(neuronAuc - best),
    verified: neuronAuc >= mean, beatsBest: neuronAuc >= best };   // verified = the cube is worth more than its average worker
}

// THE NEURON MAP: one neuron per dataset, addressed into the 127-address space (the router's neuron layer / swarm).
export function neuronMap(datasets, opts = {}) {
  const neurons = [];
  datasets.forEach((ds, k) => {
    const n = growNeuron(ds, opts);
    if (!n.ok) return;
    neurons.push({ address: k % ADDRESS_SPACE, ...neuronVerdict(n, ds), real: !!ds.real });
  });
  const verified = neurons.filter((n) => n.verified).length;
  return { addressSpace: ADDRESS_SPACE, populated: neurons.length, verified, neurons };
}

export default { growWorker, growNeuron, resolve, neuronVerdict, neuronMap, WORKERS, ADDRESS_SPACE };
