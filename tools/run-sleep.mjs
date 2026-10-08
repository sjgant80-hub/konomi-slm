// tools/run-sleep.mjs — run the nightly fold-cycle over the day's memories (built from the real build artifacts),
// keep only the dreams whose recall survives, write pattern-books/sleep.json, print what consolidated and what refused.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sleepFold } from './sleep.mjs';

const dir = fileURLToPath(new URL('../pattern-books/', import.meta.url));
const idx = JSON.parse(fs.readFileSync(dir + 'index.json', 'utf8'));

// the day's memories — derived from REAL artifacts (real numbers), as short prose facts
const mem = [];
for (const f of (idx.forged || [])) mem.push({ id: f.domain, text: `the ${f.domain} organ is a verified pattern-library; it was kept by the gate only because it predicted held-out cases it never saw, scoring held-out AUC ${f.heldAuc}, selected via ${f.selectedBy || 'search'}` });
try { const c = JSON.parse(fs.readFileSync(dir + 'shopper.council.receipt.json', 'utf8')); mem.push({ id: 'council', text: `the gated council ranked every proposer by held-out prediction with no vote, so no member could collude; the gate kept ${c.winner} at held-out AUC ${c.heldAuc}` }); } catch {}
try { const s = JSON.parse(fs.readFileSync(dir + 'synapses.json', 'utf8')); mem.push({ id: 'synapses', text: `synapses wired ${s.nodes.length} verified organs into one mind, keeping ${s.edges.length} links and pruning the weak connections with the dream-gate` }); } catch {}
// a few more real session facts (shared vocabulary -> they cluster)
mem.push(
  { id: 'ladder', text: 'the ladder grows the verified library tier by tier, monotone, never regressing a domain, the library compounding without retraining any weights' },
  { id: 'inversion', text: 'the konomi inversion puts knowledge in a verified readable pattern-library that predicts held-out or is cut, not in opaque weights, so it abstains instead of hallucinating' },
  { id: 'corpus', text: 'the corpus path forged science and philosophy pattern-organs from cited taxonomies, the gate keeping only rules that predicted held-out statements' },
  { id: 'cross-breed', text: 'cross-breeding keeps a child pattern only if it beats both parents on held-out, so the organ can climb but never slip' },
  { id: 'door', text: 'the one front door converges the estate into one sovereign verified mind you own, every link a live tool whose numbers re-run' },
);
// a real transcript repeats itself — the same theme logged many times across the day. these near-duplicates are
// exactly what sleep should consolidate: shared vocabulary, so the dream keeps recall while collapsing the repetition.
mem.push(
  { id: 'say1', text: 'the konomi inversion: knowledge lives in a verified pattern-library that predicts held-out or is cut, not in opaque weights, so it abstains instead of hallucinating' },
  { id: 'say2', text: 'konomi inversion again — verified pattern-library over opaque weights, predicts held-out or cut, abstains not hallucinates, knowledge not in weights' },
  { id: 'say3', text: 'restating the inversion: knowledge in a verified pattern-library not weights; it predicts held-out cases or is cut; it abstains rather than hallucinate' },
  { id: 'say4', text: 'the inversion once more: a verified pattern-library holds the knowledge, not weights; predicts held-out or cut; abstains, never hallucinates' },
);

const r = sleepFold(mem, { threshold: 0.45, minShare: 0.5 });
const rc = r.receipt;
fs.writeFileSync(dir + 'sleep.json', JSON.stringify({ ...rc, journal: r.journal.map((m) => ({ id: m.id, dream: !!m.dream, from: m.from || null })) }, null, 2));

const P = (s) => console.log(s);
P('\n◊ SLEEP — the nightly fold-cycle (keep a dream only if recall survives)\n' + '='.repeat(64));
P(`memories in: ${rc.memoriesIn} (${rc.bytesIn} bytes)  →  journal out: ${rc.memoriesOut} (${rc.bytesOut} bytes)`);
P(`recall: ${rc.recallBefore} before → ${rc.recallAfter} after  ·  ${rc.recallHeld ? 'HELD ✓ (no memory lost)' : 'DROPPED ✗'}  ·  ${rc.queries} recall queries`);
P(`\nDREAMS KEPT (consolidated, recall survived):`);
for (const d of rc.dreamsKept) P(`  ${d.from.join(' + ')}  →  one dream  (${d.bytes[0]}→${d.bytes[1]} bytes)`);
if (!rc.dreamsKept.length) P('  (none this run)');
if (rc.dreamsRefused.length) { P(`\nDREAMS REFUSED (would lose recall — left raw, honestly not forgotten):`); for (const d of rc.dreamsRefused) P(`  ${d.from.join(' + ')}  —  ${d.why}`); }
P(`\nkept whole (singletons, nothing to fold): ${rc.singletons.join(', ')}`);
P(`\nwrote pattern-books/sleep.json\n`);
