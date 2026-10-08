// tools/run-cortex.mjs — boot the running cortex on this host and show the body alive: the stack it loaded, and a
// couple of real thoughts (route -> verified organ, or abstain).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, think, status } from './cortex.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const cx = boot(ctx);
const s = status(cx);

const P = (s) => console.log(s);
P('\n◊ THE CORTEX — the body, booted on this host\n' + '='.repeat(60));
P(`host     : ${s.host} · ${s.ram} GB · tier ${s.tier}`);
P(`model    : ${s.model}`);
P(`library  : ${s.organs} organs · ${s.libraryBytes} bytes · mean held-out AUC ${s.meanHeldAuc}`);
P(`neurons  : ${s.neurons} on the map · ${s.neuronsVerified} verified`);
P(`synapses : ${s.synapses} links`);
P(`sleep    : recall ${s.sleepRecallHeld ? 'held ✓' : '—'}   evolution: ${s.evolutionImproved} organs fitter`);
P(`cortex box: ${s.isCortexBox ? 'yes' : 'no — the real small cortex, running here'}`);

// two real thoughts
const ds = loadDomain('triage', ctx);
const real = Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][ds.heldRows[0]]]));
const junk = Object.fromEntries(ds.features.map((f) => [f, 99999]));
const a = think(cx, real), b = think(cx, junk);
P(`\nthink(a real triage case)  -> ${a.verdict}${a.verdict === 'VERIFIED' ? ' (' + a.domain + ', label ' + a.label + ')' : ''}`);
P(`think(out-of-distribution) -> ${b.verdict}  (${b.why || ''})`);
P('\nthe body is running — route to a verified organ, or refuse. live on this laptop.\n');

fs.writeFileSync(fileURLToPath(new URL('../pattern-books/cortex.json', import.meta.url)), JSON.stringify(s, null, 2));
