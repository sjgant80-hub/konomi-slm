// tools/forge-all.mjs — forge a batch of domain pattern-organs, 14b/7b-led, and build the pattern-book library.
// Run: PROPOSE_MODEL=qwen2.5:7b node tools/forge-all.mjs marketing churn credit fraud maintenance
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgeOrgan } from './patternforge.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const model = process.env.PROPOSE_MODEL || 'qwen2.5:7b';
const LABELS = { shopper: 'the visitor makes a purchase', triage: 'the patient is critical', water: 'the water is potable',
  crop: 'plant now', fraud: 'the transaction is fraud', maintenance: 'the machine fails soon', credit: 'the loan defaults',
  churn: 'the customer churns', energy: 'the grid overloads', intrusion: 'a network intrusion', inventory: 'the item stocks out',
  marketing: 'the lead converts' };

const domains = process.argv.slice(2).length ? process.argv.slice(2) : ['marketing', 'churn', 'credit', 'fraud', 'maintenance'];
const out = fileURLToPath(new URL('../pattern-books/', import.meta.url));
fs.mkdirSync(out, { recursive: true });

console.log(`\n◊ PATTERNFORGE — forging ${domains.length} organs, led by ${model} (sovereign)\n` + '='.repeat(66));
const summary = [];
for (const d of domains) {
  const ds = DOMAIN_IDS.includes(d) ? loadDomain(d, ctx) : loadDomainExt(d);
  if (ds.ok === false) { console.log(`  ${d}: skip (${ds.error})`); continue; }
  const t0 = process.hrtime.bigint();
  const r = await forgeOrgan(ds, { label1: LABELS[d] || 'the positive outcome', model, provenance: ds.real ? 'real data' : 'realistic-synthetic, from a known rule' });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  if (!r.ok) { console.log(`  ${d}: FAILED ${r.error}`); continue; }
  fs.writeFileSync(out + d + '.book.txt', r.book + '\n');
  fs.writeFileSync(out + d + '.receipt.json', JSON.stringify(r.receipt, null, 2));
  fs.writeFileSync(out + d + '.mind-context.txt', r.mindContext + '\n');
  summary.push({ domain: d, heldAuc: r.heldAuc, selectedBy: r.selectedBy, feats: r.hypotheses.map((h) => h.feature).join('/') || '(search)', secs: secs.toFixed(0) });
  console.log(`  ✓ ${d.padEnd(12)} held-out AUC ${String(r.heldAuc).padEnd(9)} via ${r.selectedBy.padEnd(26)} [${summary[summary.length - 1].feats}]  ${summary[summary.length - 1].secs}s`);
}

// write a library index the pattern-books page / the mind can read
fs.writeFileSync(out + 'index.json', JSON.stringify({ model, forged: summary, count: summary.length }, null, 2));
console.log(`\nforged ${summary.length} pattern-books → pattern-books/  (index.json written)\n`);
