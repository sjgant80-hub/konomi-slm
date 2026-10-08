// tools/run-body.mjs — report the body's cortex for THIS host, and the plan for a 512 GB box.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { body, cortexPlan } from './body.mjs';

const b = body();
const box = cortexPlan(512);
const P = (s) => console.log(s);
P('\n◊ THE BODY — the hardware-aware cortex\n' + '='.repeat(60));
P(`\nthis host: ${b.host.host} · ${b.host.platform} · ${b.host.cpus} threads · ${b.host.ramGB} GB RAM`);
P(`  → cortex tier: ${b.cortex.tier}`);
P(`  → model: ${b.cortex.model}`);
P(`  → ${b.cortex.note}`);
P(`  → neuron map: hosts ${b.cortex.hostsFullMap ? 'the full 127 addresses' : 'a partial map'} · frontier model: ${b.cortex.runsFrontierModel ? 'yes' : 'no (needs a cortex box)'}`);
P(`  → is a cortex box: ${b.isCortexBox ? 'YES' : 'no — the real small cortex runs here'}`);
P(`\nON A 512 GB BOX → cortex tier ${box.tier}: ${box.model}`);
P(`  ${box.note} · hosts all ${box.neuronAddresses} neuron addresses`);
P('  bring-up (run these on the box):');
for (const c of box.bringUp) P('    ' + c);
fs.writeFileSync(fileURLToPath(new URL('../pattern-books/body.json', import.meta.url)), JSON.stringify({ thisHost: b, box512: box }, null, 2));
P('\nwrote pattern-books/body.json\n');
