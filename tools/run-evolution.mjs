// tools/run-evolution.mjs — evolve every tabular organ's feature-set with held-out AUC as fitness; write the result.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evolve } from './evolution.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const IDS = [...DOMAIN_IDS, ...EXT_IDS];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : IDS;

console.log(`\n◊ EVOLUTION — organs evolve their feature-set, held-out AUC as fitness (witness as fitness)\n` + '='.repeat(68));
const rows = [];
for (const id of ids) {
  const ds = DOMAIN_IDS.includes(id) ? loadDomain(id, ctx) : loadDomainExt(id);
  if (ds.ok === false) continue;
  const e = evolve(ds, { generations: 5, population: 6 });
  if (!e.ok) continue;
  rows.push({ domain: id, baselineAuc: e.baselineAuc, evolvedAuc: e.evolvedAuc, lift: e.lift, keptOf: e.keptOf, evolvedFeatures: e.evolvedFeatures, improved: e.improved, real: !!ds.real });
  const arrow = e.lift > 0.0001 ? `▲ +${e.lift}` : '= 0';
  console.log(`  ${id.padEnd(12)} all ${String(e.baselineAuc).padEnd(9)} → evolved ${String(e.evolvedAuc).padEnd(9)} ${arrow.padEnd(11)} kept ${e.keptOf}  [${e.evolvedFeatures.join(', ')}]${e.real ? '  (REAL)' : ''}`);
}
const improved = rows.filter((r) => r.improved).length;
const meanLift = rows.length ? Math.round(rows.reduce((a, r) => a + r.lift, 0) / rows.length * 1e6) / 1e6 : 0;
console.log(`\n${rows.length} organs evolved · ${improved} found a fitter, smaller config · mean lift +${meanLift} · none worse than baseline (monotone)`);
fs.writeFileSync(fileURLToPath(new URL('../pattern-books/evolution.json', import.meta.url)), JSON.stringify({ organs: rows, improved, meanLift }, null, 2));
console.log(`wrote pattern-books/evolution.json\n`);
