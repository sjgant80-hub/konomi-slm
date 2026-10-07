// tools/run-forge.mjs — forge a domain's pattern-organ, 14b-led, and print the verified pattern book.
// Run: PROPOSE_MODEL=qwen2.5:14b node tools/run-forge.mjs [domain]   (needs local Ollama; the 14b leads)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgeOrgan } from './patternforge.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const DOMAIN = process.argv[2] || 'shopper';
const LABELS = { shopper: 'the visitor makes a purchase', triage: 'the patient is critical', water: 'the water is potable',
  crop: 'plant now', fraud: 'the transaction is fraud', maintenance: 'the machine fails soon', credit: 'the loan defaults',
  churn: 'the customer churns', energy: 'the grid overloads', intrusion: 'a network intrusion', inventory: 'the item stocks out' };
const PROV = { shopper: 'UCI Online Shoppers Purchasing Intention (Sakar & Kastro, 2018, CC BY 4.0) — REAL, 12,330 sessions' };

const ds = DOMAIN_IDS.includes(DOMAIN) ? loadDomain(DOMAIN, ctx) : loadDomainExt(DOMAIN);
const model = process.env.PROPOSE_MODEL || 'qwen2.5:14b';
console.log(`\n◊ PATTERNFORGE — forging the "${DOMAIN}" organ, led by ${model} (sovereign)…\n`);
const r = await forgeOrgan(ds, { label1: LABELS[DOMAIN] || 'the positive outcome', model, provenance: PROV[DOMAIN] || (ds.real ? 'real data' : 'realistic-synthetic, generated from a known rule') });
if (!r.ok) { console.error(r.error); process.exit(1); }

console.log(`The 14b proposed these features carry the signal:`);
for (const h of r.hypotheses) console.log(`  ${h.feature} (${h.direction})`);
if (!r.hypotheses.length) console.log('  (none parsed — the gate fell back to search)');
console.log(`\nselected by: ${r.selectedBy}   (validation AUC ${r.valAuc})`);
console.log('\n' + '='.repeat(68) + '\n' + r.book + '\n' + '='.repeat(68));
console.log(`\nOWNED MODEL (the seed you keep): ${r.ownedSeed}  (${r.ownedSeedBytes} bytes)`);
console.log(`receipt ${r.receipt.receiptHash.slice(0, 16)}…`);
console.log(`\n↻ this verified book is the knowledge to feed the mind (grow-not-retrain level-up).`);

// write the shipped artifacts
const out = fileURLToPath(new URL('../pattern-books/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + DOMAIN + '.book.txt', r.book + '\n');
fs.writeFileSync(out + DOMAIN + '.receipt.json', JSON.stringify(r.receipt, null, 2));
fs.writeFileSync(out + DOMAIN + '.mind-context.txt', r.mindContext + '\n');
console.log(`\nshipped: pattern-books/${DOMAIN}.{book.txt, receipt.json, mind-context.txt}\n`);
