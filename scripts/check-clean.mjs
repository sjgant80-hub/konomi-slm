// CI gate: fail the build unless the named witness verdict is clean. Usage: node scripts/check-clean.mjs [file]
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'witness.out.json';
const w = JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
if (!w.clean) { console.error(file + ': witness NOT clean - ' + (w.survived || []).length + ' survivor(s)'); process.exit(1); }
console.log(file + ': witness clean - score ' + w.score + ' (' + w.killed + ' killed, ' + (w.ignored || []).length + ' reviewed-equivalent)');
