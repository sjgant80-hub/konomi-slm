// tools/run-synapses.mjs — wire the organs into a mind: read the pattern-book library, build the synapse graph,
// prune the weak links (dream-gate), write pattern-books/synapses.json, print the strongest synapses.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSynapses, prune } from './synapses.mjs';

const dir = fileURLToPath(new URL('../pattern-books/', import.meta.url));
const FIELD = { shopper: 'commerce', churn: 'commerce', marketing: 'marketing', inventory: 'supply', triage: 'medical',
  water: 'water', crop: 'agriculture', fraud: 'finance', credit: 'finance', maintenance: 'industry', energy: 'energy',
  intrusion: 'security', science: 'epistemology', philosophy: 'epistemology' };
const FAMILY = { commerce: 'money', finance: 'money', marketing: 'money', supply: 'money',
  industry: 'ops', energy: 'ops', security: 'ops', medical: 'care', water: 'care', agriculture: 'care',
  epistemology: 'knowledge' };

const idx = JSON.parse(fs.readFileSync(dir + 'index.json', 'utf8'));
const organs = [];
for (const f of (idx.forged || [])) {
  const p = dir + f.domain + '.book.txt';
  if (!fs.existsSync(p)) continue;
  const field = FIELD[f.domain] || f.domain;
  organs.push({ domain: f.domain, field, family: FAMILY[field] || field, book: fs.readFileSync(p, 'utf8') });
}

const floor = Number(process.env.SYNAPSE_FLOOR || 0.15);
const graph = prune(buildSynapses(organs), floor);
fs.writeFileSync(dir + 'synapses.json', JSON.stringify({ nodes: graph.nodes, edges: graph.edges, floor, built: 'deterministic (field + shared-structure); Hebbian-ready' }, null, 2));

console.log(`\n◊ SYNAPSES — ${organs.length} organs wired into one mind (dream-gate floor ${floor})\n` + '='.repeat(64));
console.log(`nodes: ${graph.nodes.length} · synapses kept: ${graph.edges.length} (of ${organs.length * (organs.length - 1) / 2} possible)\n`);
console.log('strongest synapses (link · weight · same-field · shared-structure):');
for (const e of graph.edges.slice(0, 14)) console.log(`  ${(e.a + ' — ' + e.b).padEnd(30)} ${e.w}   ${e.same ? 'same-field' : '         '}  sim ${e.sim}`);
// which organs ended up isolated (no surviving synapse) — honest
const linked = new Set(graph.edges.flatMap((e) => [e.a, e.b]));
const isolated = graph.nodes.map((n) => n.domain).filter((d) => !linked.has(d));
if (isolated.length) console.log(`\nisolated (no link cleared the gate): ${isolated.join(', ')} — distinct structure, honestly on their own.`);
console.log(`\nwrote pattern-books/synapses.json\n`);
