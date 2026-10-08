// tools/run-neurons.mjs — grow the neuron map: one neuron (a cube of 8 workers + a rule resolver) per tabular organ,
// addressed into the 127-space, and show whether each cube beats its best single worker on held-out.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { growNeuron, neuronVerdict, ADDRESS_SPACE } from './neurons.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const IDS = [...DOMAIN_IDS, ...EXT_IDS];                 // the tabular organs
const only = process.argv.slice(2);
const ids = only.length ? only : IDS;

console.log(`\n◊ NEURONS — the cube (8 workers + rule resolver) per organ, into the ${ADDRESS_SPACE}-address map\n` + '='.repeat(66));
const rows = [];
ids.forEach((id, k) => {
  const ds = DOMAIN_IDS.includes(id) ? loadDomain(id, ctx) : loadDomainExt(id);
  if (ds.ok === false) return;
  const n = growNeuron(ds);
  if (!n.ok) return;
  const v = neuronVerdict(n, ds);
  rows.push({ address: k % ADDRESS_SPACE, ...v, real: !!ds.real });
  const arrow = v.liftVsMean > 0.0001 ? `▲ +${v.liftVsMean} vs mean` : v.liftVsMean < -0.0001 ? `▼ ${v.liftVsMean} vs mean` : "= mean";
  console.log(`  @${String(k).padStart(3)} ${id.padEnd(12)} cube ${String(v.neuronAuc).padEnd(9)} vs best-worker ${String(v.bestWorker).padEnd(9)} ${arrow.padEnd(10)} ${v.verified ? "verified ✓" : "—"}${v.beatsBest ? " · beats best" : ""}${v.real ? "  (REAL)" : ""}`);
});
const verified = rows.filter((r) => r.verified).length;
const meanLift = rows.length ? Math.round(rows.reduce((a, r) => a + r.liftVsMean, 0) / rows.length * 1e6) / 1e6 : 0;
console.log(`\nneuron map: ${rows.length} neurons populated of ${ADDRESS_SPACE} addresses · ${verified} verified (cube ≥ mean worker) · mean lift ${meanLift}`);
const out = fileURLToPath(new URL('../pattern-books/neurons.json', import.meta.url));
fs.writeFileSync(out, JSON.stringify({ addressSpace: ADDRESS_SPACE, populated: rows.length, verified, meanLift, neurons: rows }, null, 2));
console.log(`wrote pattern-books/neurons.json\n`);
