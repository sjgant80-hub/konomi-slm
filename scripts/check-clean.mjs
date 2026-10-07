// CI gate: fail the build unless the witness verdict is clean. Reads witness.out.json (written by the gate step).
import { readFileSync } from 'node:fs';
const w = JSON.parse(readFileSync(new URL('../witness.out.json', import.meta.url), 'utf8'));
if (!w.clean) { console.error('witness NOT clean: ' + (w.survived || []).length + ' survivor(s)'); process.exit(1); }
console.log('witness clean - score ' + w.score + ' (' + w.killed + ' killed, ' + (w.ignored || []).length + ' reviewed-equivalent)');
