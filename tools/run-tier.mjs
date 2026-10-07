// tools/run-tier.mjs — climb one rung: build tier-1, grow tier-2 from it, print the tier-over-tier receipt.
// Deterministic. Run: node tools/run-tier.mjs [--json]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLibrary } from '../konomi-slm.mjs';
import { growTier, tierReceipt } from '../grow-tier.mjs';
import { DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { LADDER_BATCHES } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };

// climb every rung: tier 1 (vendored domains) then one batch of new verticals per rung
const tiers = [buildLibrary(DOMAIN_IDS, ctx)];
const receipts = [];
for (const batch of LADDER_BATCHES) {
  const prev = tiers[tiers.length - 1];
  const next = growTier(prev, { ctx, newDomains: batch });
  receipts.push(tierReceipt(prev, next));
  tiers.push(next);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ tiers: tiers.map((t, i) => ({ tier: i + 1, domains: t.domains, meanHeldAuc: t.meanHeldAuc, libraryBytes: t.libraryBytes })), receipts }, null, 2));
} else {
  const P = (s) => console.log(s);
  P('\n◊ THE LADDER — each tier builds the next (grow the library, never train weights)\n' + '='.repeat(66));
  tiers.forEach((t, i) => P(`TIER ${i + 1}: ${String(t.domains.length).padStart(2)} domains · mean held-out AUC ${t.meanHeldAuc} · ${t.libraryBytes} bytes of seeds`));
  for (let i = 0; i < receipts.length; i++) {
    const prev = tiers[i], next = tiers[i + 1], rec = receipts[i];
    P(`\n── rung ${i + 1}→${i + 2} (champion-warm-started, monotone-gated) ──`);
    for (const d of rec.perDomain) {
      const t2 = next.patterns[d.domain]; const arrow = t2.heldAuc > d.tier1Auc + 1e-9 ? '▲ deepened' : '= held';
      P(`  ${d.domain.padEnd(12)} ${String(d.tier1Auc).padEnd(9)} -> ${String(t2.heldAuc).padEnd(9)} ${arrow}`);
    }
    for (const id of rec.added) P(`  + ${id.padEnd(12)} held-out AUC ${next.patterns[id].heldAuc}  (new, ${next.patterns[id].real ? 'REAL' : 'synthetic'})`);
    for (const c of next.cut) P(`  CUT: ${c.domain} — ${c.why}`);
    P(`  monotone: ${rec.monotone ? 'YES ✓' : 'NO ✗'}   receipt ${rec.receiptHash.slice(0, 16)}…`);
  }
  const first = tiers[0], last = tiers[tiers.length - 1];
  P(`\nLADDER: ${first.domains.length} → ${last.domains.length} domains · mean AUC ${first.meanHeldAuc} → ${last.meanHeldAuc} · ${first.libraryBytes} → ${last.libraryBytes} bytes · every rung monotone\n`);
}
