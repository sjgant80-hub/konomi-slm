// tools/run-corpus.mjs — the corpus path: forge the science + philosophy pattern-organs from cited taxonomies,
// 14b-led, and print the readable pattern-book. Run: PROPOSE_MODEL=qwen2.5:14b node tools/run-corpus.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgeOrgan } from './patternforge.mjs';
import { loadCorpus, CORPUS_IDS } from './corpus.mjs';

const out = fileURLToPath(new URL('../pattern-books/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const model = process.env.PROPOSE_MODEL || 'qwen2.5:14b';
const PROV = { science: "Popper's falsifiability / demarcation criterion (realistic-synthetic from that cited rule)",
  philosophy: 'the empiricism vs rationalism epistemology distinction (realistic-synthetic from that cited rule)' };

const summary = [];
for (const d of CORPUS_IDS) {
  const ds = loadCorpus(d);
  console.log(`\n◊ CORPUS PATH — forging "${d}" (${ds.title}), led by ${model}\n` + '='.repeat(66));
  console.log('sample statements (text → label):');
  for (const s of ds._samples.slice(0, 4)) console.log(`  [${s.y}] ${s.text}`);
  const r = await forgeOrgan(ds, { label1: ds.label1, model, provenance: PROV[d] });
  if (!r.ok) { console.log('  FAILED: ' + r.error); continue; }
  console.log(`\nthe ${model} proposed these markers carry the signal: ${r.hypotheses.map((h) => h.feature + '(' + h.direction + ')').join(', ') || '(search)'}`);
  console.log(`selected by: ${r.selectedBy}  ·  val ${r.valAuc}`);
  console.log('\n' + r.book + '\n');
  fs.writeFileSync(out + d + '.book.txt', r.book + '\n');
  fs.writeFileSync(out + d + '.receipt.json', JSON.stringify(r.receipt, null, 2));
  fs.writeFileSync(out + d + '.mind-context.txt', r.mindContext + '\n');
  summary.push({ domain: d, heldAuc: r.heldAuc, selectedBy: r.selectedBy, feats: r.hypotheses.map((h) => h.feature).join('/') || '(search)', secs: '-' });
}

// merge into the library index (keep whatever is already there)
const idxPath = out + 'index.json';
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { forged: [] };
const byDomain = Object.fromEntries((idx.forged || []).map((f) => [f.domain, f]));
for (const s of summary) byDomain[s.domain] = s;
idx.forged = Object.values(byDomain);
idx.count = idx.forged.length;
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));
console.log(`library now ${idx.count} books (added: ${summary.map((s) => s.domain + ' ' + s.heldAuc).join(', ')})\n`);
