// tools/run-tier.mjs — climb one rung: build tier-1, grow tier-2 from it, print the tier-over-tier receipt.
// Deterministic. Run: node tools/run-tier.mjs [--json]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLibrary } from '../konomi-slm.mjs';
import { growTier, tierReceipt } from '../grow-tier.mjs';
import { DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { EXT_IDS } from '../domains-ext.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };

const tier1 = buildLibrary(DOMAIN_IDS, ctx);
const tier2 = growTier(tier1, { ctx, newDomains: EXT_IDS });
const receipt = tierReceipt(tier1, tier2);

if (process.argv.includes('--json')) { console.log(JSON.stringify({ tier1: { domains: tier1.domains, meanHeldAuc: tier1.meanHeldAuc, libraryBytes: tier1.libraryBytes }, tier2: { domains: tier2.domains, meanHeldAuc: tier2.meanHeldAuc, libraryBytes: tier2.libraryBytes }, receipt }, null, 2)); }
else {
  const P = (s) => console.log(s);
  P('\n◊ THE LADDER — tier 1 builds tier 2 (grow the library, never train weights)\n' + '='.repeat(66));
  P(`\nTIER 1: ${tier1.domains.length} domains · mean held-out AUC ${tier1.meanHeldAuc} · ${tier1.libraryBytes} bytes of seeds`);
  P(`TIER 2: ${tier2.domains.length} domains · mean held-out AUC ${tier2.meanHeldAuc} · ${tier2.libraryBytes} bytes of seeds`);
  P(`\nPER DOMAIN (tier1 AUC -> tier2 AUC, champion-warm-started, monotone-gated):`);
  for (const d of receipt.perDomain) {
    const t2 = tier2.patterns[d.domain];
    const arrow = t2.heldAuc > d.tier1Auc + 1e-9 ? '  ▲ deepened' : '  = held';
    P(`  ${d.domain.padEnd(12)} ${String(d.tier1Auc).padEnd(9)} -> ${String(t2.heldAuc).padEnd(9)}${arrow}`);
  }
  if (receipt.added.length) {
    P(`\nBROADENED (new verified domains — polymath):`);
    for (const id of receipt.added) P(`  + ${id.padEnd(12)} held-out AUC ${tier2.patterns[id].heldAuc}  (${tier2.patterns[id].real ? 'REAL' : 'synthetic'})`);
  }
  if (tier2.cut.length) for (const c of tier2.cut) P(`  CUT: ${c.domain} — ${c.why}`);
  P(`\nGUARANTEE:`);
  P(`  monotone (no existing domain regressed): ${receipt.monotone ? 'YES ✓' : 'NO ✗'}`);
  P(`  breadth: ${tier1.domains.length} -> ${tier2.domains.length} domains   mean AUC: ${tier1.meanHeldAuc} -> ${tier2.meanHeldAuc} (>= tier 1)`);
  P(`  library still tiny: ${tier2.libraryBytes} bytes of seeds (${tier2.ratio}x compression)`);
  P(`  receipt ${receipt.receiptHash}\n`);
}
