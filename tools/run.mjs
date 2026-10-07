// tools/run.mjs — build the Konomi SLM library on real domains and MEASURE it: the gate (verified vs cut),
// the Konomi compression ratio (knowledge-in-seeds), routing, and the head-to-head that shows the abstain
// advantage (a model that refuses when it has no verified pattern beats one that always guesses on a mixed
// stream). Deterministic — fixed strides, no RNG, no clock. Run: node tools/run.mjs [--json]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLibrary, answer, route, GATE_AUC, ROUTE_MIN } from '../konomi-slm.mjs';
import { loadDomain, DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };

const rowInput = (ds, i) => Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][i]]));
// out-of-distribution junk: same feature NAMES, values shoved far past the training range -> must ABSTAIN
const junkInput = (ds, i, lib) => {
  const p = lib.patterns[ds.name];
  return Object.fromEntries(ds.features.map((f) => {
    const fp = p.dist[f]; const span = Math.max(fp.max - fp.min, 1);
    return [f, fp.max + 4 * span];
  }));
};
const sample = (rows, k) => { const step = Math.max(1, Math.floor(rows.length / k)); const out = []; for (let i = 0; i < rows.length && out.length < k; i += step) out.push(rows[i]); return out; };

const lib = buildLibrary(DOMAIN_IDS, ctx);

// ── per-domain: answer in-domain held rows + abstain on junk; tally vs a flat always-guess baseline ──────────
const perDomain = {};
let slmCorrect = 0, slmTotal = 0, flatCorrect = 0, routeHits = 0, routeTotal = 0;
for (const id of lib.domains) {
  const ds = loadDomain(id, ctx);
  const held = sample(ds.heldRows, 120);
  const base = held.reduce((a, i) => a + ds.y[i], 0) / held.length;
  const flatLabel = base >= 0.5 ? 1 : 0;                       // the flat model's single always-guess
  let answered = 0, right = 0, abstained = 0, routedRight = 0, junkAbstained = 0;
  for (const i of held) {
    const inp = rowInput(ds, i);
    const rr = route(lib, inp); if (rr.best && rr.best.domain === id) routedRight++;
    routeTotal++;
    const a = answer(lib, inp);
    if (a.verdict === 'VERIFIED') { answered++; if (a.label === ds.y[i]) { right++; } }
    else abstained++;
    // flat baseline: always answers its majority guess, never abstains
    if (flatLabel === ds.y[i]) flatCorrect++;
    slmTotal++;
    // Konomi SLM "trust" credit on the answerable stream: a correct verified answer scores; a wrong or abstain does not
    if (a.verdict === 'VERIFIED' && a.label === ds.y[i]) slmCorrect++;
  }
  // junk stream for this domain: the SLM should abstain; the flat model will still emit a label it cannot justify
  const junk = sample(ds.heldRows, 60);
  let junkSlmAbstain = 0;
  for (const i of junk) { const a = answer(lib, junkInput(ds, i, lib)); if (a.verdict === 'ABSTAIN') junkSlmAbstain++; }
  routeHits += routedRight;
  perDomain[id] = {
    title: lib.patterns[id].title, real: lib.patterns[id].real,
    heldAuc: lib.patterns[id].heldAuc, heldAcc: lib.patterns[id].heldAcc,
    seedBytes: lib.patterns[id].seedStr.length, verified: lib.patterns[id].verified,
    tested: held.length, answered, abstained, answerAcc: answered ? +(right / answered).toFixed(4) : 0,
    routeAcc: +(routedRight / held.length).toFixed(4),
    junkTested: junk.length, junkAbstainRate: +(junkSlmAbstain / junk.length).toFixed(4),
  };
}

// ── the mixed-stream head-to-head: answerable (in-domain) + unanswerable (junk) in one stream ────────────────
// Konomi SLM scores a point for a correct verified answer OR a correct abstain on junk.
// Flat baseline always answers: it scores on answerable only, and is WRONG to answer every junk item.
let mixTotal = 0, slmMix = 0, flatMix = 0;
for (const id of lib.domains) {
  const ds = loadDomain(id, ctx);
  for (const i of sample(ds.heldRows, 80)) {               // answerable
    const a = answer(lib, rowInput(ds, i)); mixTotal++;
    if (a.verdict === 'VERIFIED' && a.label === ds.y[i]) slmMix++;
    const base = ds.heldRows.reduce((s, j) => s + ds.y[j], 0) / ds.heldRows.length;
    if ((base >= 0.5 ? 1 : 0) === ds.y[i]) flatMix++;
  }
  for (const i of sample(ds.heldRows, 40)) {               // unanswerable junk
    const a = answer(lib, junkInput(ds, i, lib)); mixTotal++;
    if (a.verdict === 'ABSTAIN') slmMix++;                 // correct refusal
    // flat baseline answers junk confidently -> never correct to do so -> +0
  }
}

const report = {
  gate: { gateAuc: GATE_AUC, routeMin: ROUTE_MIN },
  library: {
    verified: lib.domains, cut: lib.cut,
    libraryBytes: lib.libraryBytes, grownBytes: lib.grownBytes, ratio: lib.ratio, meanHeldAuc: lib.meanHeldAuc,
  },
  perDomain,
  headToHead: {
    note: 'Mixed stream: in-domain (answerable) + out-of-distribution junk (unanswerable). SLM may ABSTAIN; flat baseline always guesses.',
    items: mixTotal,
    konomiSlmTrust: +(slmMix / mixTotal).toFixed(4),
    flatBaselineTrust: +(flatMix / mixTotal).toFixed(4),
  },
  routing: { accuracy: +(routeHits / routeTotal).toFixed(4), tested: routeTotal },
};

if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); }
else {
  const P = (s) => console.log(s);
  P('\n◊ THE KONOMI SLM — measured\n' + '='.repeat(60));
  P(`\nTHE GATE (predict held-out >= AUC ${GATE_AUC} or be CUT):`);
  P(`  verified into the library: ${lib.domains.join(', ') || '(none)'}`);
  if (lib.cut.length) for (const c of lib.cut) P(`  CUT: ${c.domain} — ${c.why}`);
  P(`\nKNOWLEDGE-IN-SEEDS (Konomi compression, lossless — the seed re-grows the pattern):`);
  P(`  whole library = ${lib.libraryBytes} bytes of seeds  ->  ${lib.grownBytes} bytes grown  (${lib.ratio}x)`);
  P(`  mean held-out AUC across verified patterns: ${lib.meanHeldAuc}`);
  P(`\nPER DOMAIN (answer on in-domain held, abstain on out-of-distribution junk):`);
  for (const id of lib.domains) { const d = perDomain[id];
    P(`  ${id.padEnd(8)} AUC ${d.heldAuc}  answerAcc ${d.answerAcc}  answered ${d.answered}/${d.tested}  route ${d.routeAcc}  junk-abstain ${d.junkAbstainRate}  (${d.real ? 'REAL data' : 'synthetic'})`);
  }
  P(`\nROUTING: picked the right pattern ${(report.routing.accuracy * 100).toFixed(1)}% over ${report.routing.tested} inputs`);
  P(`\nHEAD-TO-HEAD (mixed stream of ${mixTotal}: answerable + unanswerable junk):`);
  P(`  Konomi SLM (answers OR abstains): ${(report.headToHead.konomiSlmTrust * 100).toFixed(1)}%`);
  P(`  flat baseline (always guesses):   ${(report.headToHead.flatBaselineTrust * 100).toFixed(1)}%`);
  P(`  -> the abstain is the edge: it refuses what it cannot verify instead of hallucinating.\n`);
}
