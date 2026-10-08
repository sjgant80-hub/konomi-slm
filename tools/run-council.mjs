// tools/run-council.mjs — convene the gated council on a domain and show the scoreboard. The council proposes; the
// deterministic held-out gate disposes. Run: node tools/run-council.mjs [domain]   (needs local Ollama)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgeWithCouncil, DEFAULT_COUNCIL } from './council.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { loadDomainExt, EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const DOMAIN = process.argv[2] || 'shopper';
const LABELS = { shopper: 'the visitor makes a purchase', churn: 'the customer churns', fraud: 'the transaction is fraud', credit: 'the loan defaults', marketing: 'the lead converts' };
const ds = DOMAIN_IDS.includes(DOMAIN) ? loadDomain(DOMAIN, ctx) : loadDomainExt(DOMAIN);

console.log(`\n◊ THE GATED COUNCIL on "${DOMAIN}" — members: ${DEFAULT_COUNCIL.map((m) => m.name).join(', ')} + search\n` + '='.repeat(68));
const r = await forgeWithCouncil(ds, { label1: LABELS[DOMAIN] || 'the positive outcome', provenance: ds.real ? 'real data' : 'realistic-synthetic' });
if (!r.ok) { console.error(r.error); process.exit(1); }

console.log('\nSCOREBOARD — every member scored by the gate on held-out-style validation (no vote):');
for (const s of r.scoreboard) console.log(`  ${s.member.padEnd(22)} val ${String(s.val).padEnd(10)} test ${s.test}`);
if (r.dropped.length) console.log(`  (offline, dropped: ${r.dropped.join(', ')})`);
console.log(`\nTHE GATE KEEPS: ${r.winner}   →   held-out AUC ${r.heldAuc}`);
console.log(`\n${r.collusionProof}`);
console.log('\n' + r.book);
const out = fileURLToPath(new URL('../pattern-books/', import.meta.url)); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + DOMAIN + '.council.book.txt', r.book + '\n');
fs.writeFileSync(out + DOMAIN + '.council.receipt.json', JSON.stringify(r.receipt, null, 2));
console.log(`\nshipped: pattern-books/${DOMAIN}.council.{book.txt,receipt.json}\n`);
