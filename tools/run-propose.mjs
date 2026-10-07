// tools/run-propose.mjs — the neurosymbolic loop, measured HONESTLY with a gate that SELECTS (never blindly refines).
// The local model PROPOSES which features predict the positive class. We form three candidates — the raw proposal,
// a search refined from it, and a search from the neutral stem — score each on a VALIDATION slice carved from TRAIN
// (never the held-out test), and KEEP THE BEST. The stem baseline is always in the pool, so the neural proposer can
// only help or tie on validation, never hurt. We then report the winner on the untouched held-out TEST.
// Run: PROPOSE_DOMAIN=fraud PROPOSE_MODEL=qwen2.5:7b node tools/run-propose.mjs   (needs local Ollama; UNGRADED)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deepen, patternFromGenome, loadAny, DEEPEN } from '../grow-tier.mjs';
import { stemGenome, splitRows, fit, scoreRow, auc } from '../vendor/seed-library/seedlib.mjs';
import { proposeGenome } from './propose-local.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const DOMAIN = process.env.PROPOSE_DOMAIN || 'fraud';
const LABELS = { shopper: 'the visitor makes a purchase', triage: 'the patient is critical', water: 'the water is potable',
  crop: 'it is a good time to plant', fraud: 'the transaction is fraud', maintenance: 'the machine fails soon',
  credit: 'the loan defaults', churn: 'the customer churns', energy: 'the grid overloads', intrusion: 'it is a network intrusion',
  inventory: 'the item stocks out' };

const ds = loadAny(DOMAIN, ctx);
if (ds.ok === false) { console.error('bad domain:', ds.error); process.exit(2); }
const seed = 4242, cfg = DEEPEN;
const inner = splitRows(ds, ds.trainRows, 0.25, seed);                    // val = inner.held, innerTrain = inner.rest (both from TRAIN)
const valAuc = (genome) => { const card = fit(ds, inner.rest, genome); return Math.round(auc(inner.held.map((i) => scoreRow(card, ds, i)), inner.held.map((i) => ds.y[i])) * 1e6) / 1e6; };
const testAuc = (genome) => patternFromGenome(ds, DOMAIN, genome, seed).heldAuc;

const prop = await proposeGenome(ds, { label1: LABELS[DOMAIN] || 'the positive outcome' });
if (!prop.ok) { console.error('proposer failed (is Ollama up?):', prop.error); process.exit(1); }

const cands = {
  'raw proposal': prop.genome,
  'refined from proposal': deepen(ds, inner.rest, seed, cfg, [prop.genome]),
  'refined from stem (baseline)': deepen(ds, inner.rest, seed, cfg, [stemGenome()]),
};
const scored = Object.entries(cands).map(([name, g]) => ({ name, g, val: valAuc(g), test: testAuc(g) }));
const winner = scored.reduce((a, b) => (b.val > a.val ? b : a));
const baseline = scored.find((s) => s.name.includes('baseline'));

const P = (s) => console.log(s);
P(`\n◊ NEUROSYMBOLIC LOOP on "${DOMAIN}" — model=${prop.model} (local, sovereign; UNGRADED)\n` + '='.repeat(64));
P(`\nThe model's hypotheses (which features push toward 1):`);
for (const h of prop.hypotheses) P(`  ${h.feature.padEnd(18)} ${h.direction}`);
if (!prop.hypotheses.length) P('  (none parsed — raw: ' + prop.raw.slice(0, 120) + ')');
P(`\nCandidates — chosen by VALIDATION (carved from train), then reported on the untouched held-out TEST:`);
for (const s of scored) P(`  ${s.name.padEnd(30)} val ${String(s.val).padEnd(9)} test ${s.test}${s === winner ? '   ← selected' : ''}`);
const delta = (winner.test - baseline.test).toFixed(4);
P(`\nGATED RESULT: the gate keeps "${winner.name}" (best on validation).`);
P(`  held-out TEST AUC: ${winner.test}   vs stem-only baseline ${baseline.test}   (${delta >= 0 ? '+' : ''}${delta})`);
P(winner.name === 'refined from stem (baseline)'
  ? '  -> on this domain the neural prior did not win selection; the gate fell back to plain search. No harm, by construction.'
  : (delta >= 0 ? '  -> the neural proposer HELPED: its candidate won validation and beats the baseline on unseen test.'
                : '  -> the neural candidate won validation but lost on test (an honest val/test gap); the gate chose on evidence it had.'));
P('  The neural layer only proposes; the gate selects on held-out-style evidence and the stem baseline is always in the pool —\n  so a wrong or weak proposal can only tie, never poison the result.\n');
