// scripts/csp-write.mjs — keep index.html's Content-Security-Policy in step with its inline scripts.
//
//   node scripts/csp-write.mjs           say whether index.html's policy is in step (exit 1 if not)
//   node scripts/csp-write.mjs --write   write the in-step policy into index.html
//
// Run --write after editing an inline script on the page; tests/page-csp.test.mjs fails in CI until you do.
import { readFileSync, writeFileSync } from 'node:fs';
import { policyFor, policyIn, withPolicy } from './csp.mjs';

const PAGE = new URL('../index.html', import.meta.url);
const html = readFileSync(PAGE, 'utf8');
if (process.argv.includes('--write')) {
  const next = withPolicy(html);
  if (next === null) { console.error('index.html has no Content-Security-Policy meta to update'); process.exit(1); }
  writeFileSync(PAGE, next);
  console.log('wrote: ' + policyIn(next));
} else {
  const ok = policyIn(html) === policyFor(html);
  console.log((ok ? 'in step: ' : 'OUT OF STEP: run node scripts/csp-write.mjs --write\nwant: ') + policyFor(html));
  process.exit(ok ? 0 : 1);
}
