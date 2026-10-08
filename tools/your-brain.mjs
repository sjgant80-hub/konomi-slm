// ════════════════════════════════════════════════════════════════
// tools/your-brain.mjs · queue #11, THE PRODUCT — a company's own brain, on its own machines
//
// The whole pitch in one command: point this at a folder of YOUR CSVs and walk away owning a booted
// brain. Each file becomes a candidate ORGAN: the generic csv-forge path turns it into a dataset
// (quantile-binned numerics, levelled categoricals), the ribosome grows a readable scorecard on the
// TRAINING rows only, and the organ earns its place ONLY if it predicts held-out rows it never saw
// (held-out AUC >= GATE_AUC) — otherwise it is CUT, with the reason written down. No signal, no
// organ: the brain refuses to pretend. The verified organs assemble into exactly the library the
// cortex boots, so think() answers from YOUR organs with a receipt, or abstains.
//
// Composes, never re-implements: vendor/csv-forge/csv.mjs (the forge's CSV kernel, witness-clean in
// its home repo) + grow-tier's deepen/patternFromGenome + the seed-library ribosome + konomi-slm's
// answer(). Deterministic end to end — same CSVs, same organs, same seeds.
//
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { prepare } from '../vendor/csv-forge/csv.mjs';
import { deepen, patternFromGenome, DEEPEN } from '../grow-tier.mjs';
import { splitRows, stemGenome } from '../vendor/seed-library/seedlib.mjs';
import { answer, GATE_AUC } from '../konomi-slm.mjs';

export const MIN_ROWS = 40;   // fewer usable rows than this is noise-sized data; we refuse, not guess
const seedNum = (id) => { let h = 7; for (const c of id) h = (h * 131 + c.charCodeAt(0)) >>> 0; return (h % 90000) + 1; };

// a thrown value's message, or the value itself — deterministic error text the gate can pin.
export function errMsg(e) { return String(e && e.message || e); }

// ── a CSV becomes a dataset in the ribosome's shape, or is refused with the reason ──────────────
export function datasetFromCsv(text, name, { target } = {}) {
  let prep;
  try { prep = prepare(String(text), { targetName: target }); }
  catch (e) { return { ok: false, error: `could not read the CSV: ${errMsg(e)}` }; }
  const cases = prep.cases || [];
  if (cases.length < MIN_ROWS) return { ok: false, error: `only ${cases.length} usable rows — fewer than ${MIN_ROWS} is noise-sized data, refusing to grow an organ from it` };
  const y = cases.map((c) => c.y);
  const pos = y.reduce((a, b) => a + b, 0);
  if (pos === 0 || pos === cases.length) return { ok: false, error: `target "${prep.targetName}" has only one class in this file — there is nothing to predict` };
  const features = prep.featureNames;
  const cols = {};
  features.forEach((f, j) => { cols[f] = cases.map((c) => c.x[j]); });
  const ds = { ok: true, name, title: name, real: true, features, n: cases.length, cols, y };
  const { held, rest } = splitRows(ds, [...Array(cases.length).keys()], 0.4, seedNum(name));
  ds.heldRows = held;
  ds.trainRows = rest;
  ds.targetName = prep.targetName;
  ds.positiveLabel = prep.positiveLabel;
  return { ok: true, ds };
}

// ── grow one organ: train on trainRows, graded on heldRows, verified or CUT ─────────────────────
export function growOrgan(ds, { cfg = DEEPEN } = {}) {
  const g = deepen(ds, ds.trainRows, seedNum(ds.name), cfg, [stemGenome()]);
  return patternFromGenome(ds, ds.name, g, seedNum(ds.name));
}

// ── assemble the verified organs into the library shape the cortex boots ────────────────────────
export function assembleBrain(results) {
  const patterns = {}, seeds = {}, cut = [];
  let libraryBytes = 0;
  for (const r of results) {
    if (r.pattern && r.pattern.verified) {
      patterns[r.name] = r.pattern;
      seeds[r.name] = r.pattern.seedStr;
      libraryBytes += Buffer.byteLength(r.pattern.seedStr, 'utf8');
    } else {
      cut.push({ organ: r.name, why: r.error || `held-out AUC ${r.pattern ? r.pattern.heldAuc : 'n/a'} below gate ${GATE_AUC} — no verified signal, no organ` });
    }
  }
  const domains = Object.keys(patterns);
  const meanHeldAuc = domains.length ? Math.round((domains.reduce((a, d) => a + patterns[d].heldAuc, 0) / domains.length) * 1e6) / 1e6 : 0;
  return { ok: domains.length > 0, patterns, seeds, domains, cut, libraryBytes, meanHeldAuc, gateAuc: GATE_AUC };
}

// think() for the owned brain — the cortex's single entry over YOUR organs.
export function think(brain, input) {
  if (!brain || !brain.patterns) return { ok: false, error: 'brain not assembled' };
  return answer(brain, input);
}

// ── the IO: a folder of CSVs in, a booted brain + receipts out ──────────────────────────────────
export function growFromDir(dataDir, { cfg } = {}) {
  const dir = resolve(dataDir);
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  if (files.length === 0) return { ok: false, error: `no .csv files in ${dir}` };
  let config = {};
  const cfgPath = join(dir, 'brain.config.json');
  if (existsSync(cfgPath)) { try { config = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* a bad config is ignored, defaults apply */ } }
  const results = [];
  for (const f of files) {
    const name = basename(f, '.csv').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const target = config.targets ? config.targets[f] : undefined;
    const d = datasetFromCsv(readFileSync(join(dir, f), 'utf8'), name, { target });
    if (!d.ok) { results.push({ name, file: f, error: d.error }); continue; }
    const pattern = growOrgan(d.ds, cfg ? { cfg } : {});
    results.push({ name, file: f, pattern, targetName: d.ds.targetName, rows: d.ds.n, held: d.ds.heldRows.length });
  }
  return { ok: true, results, brain: assembleBrain(results) };
}

// ── PURE: everything main() says and writes, extracted so the gate can verify it ───────────────
export function cliOptions(argv, demoDir) {
  const demo = argv.includes('--demo');
  const dataDir = demo ? demoDir : (argv.find((a) => !a.startsWith('--')) || 'data');
  const oi = argv.indexOf('--out');
  const outPath = oi !== -1 ? argv[oi + 1] : null;
  return { demo, dataDir, outPath };
}

export function renderRun(run) {
  const lines = [];
  for (const r of run.results) {
    if (r.pattern && r.pattern.verified) lines.push(`  ✓ organ ${r.name}: held-out AUC ${r.pattern.heldAuc} on ${r.held} rows it never saw (target "${r.targetName}")`);
    else lines.push(`  ✗ CUT ${r.name}: ${r.error || `held-out AUC ${r.pattern && r.pattern.heldAuc} below gate ${GATE_AUC}`}`);
  }
  const b = run.brain;
  lines.push(`brain: ${b.domains.length} organ(s) · ${b.libraryBytes} B of seeds · mean held-out AUC ${b.meanHeldAuc} · gate ${b.gateAuc}`);
  return lines;
}

// the organ whose held-out row the demo thought runs on: the first VERIFIED one, or null.
export function firstVerified(results) {
  return results.find((r) => r.pattern && r.pattern.verified) || null;
}

export function thinkLine(t, name) {
  if (t.verdict === 'VERIFIED') return `think(a held-out ${name} case) -> VERIFIED (label ${t.label}, receipt ${t.receipt.receiptHash.slice(0, 12)}…)`;
  return `think(a held-out ${name} case) -> ${t.verdict}`;
}

export function reportFor(run, { dataDir, grownAt }) {
  const b = run.brain;
  return {
    grownAt, dataDir, gateAuc: b.gateAuc,
    organs: run.results.map((r) => ({
      name: r.name, file: r.file,
      verified: !!(r.pattern && r.pattern.verified),
      heldAuc: r.pattern ? r.pattern.heldAuc : null,
      rows: r.rows ?? null, held: r.held ?? null,
      seed: r.pattern && r.pattern.verified ? r.pattern.seedStr : null,
      cutWhy: r.error || (r.pattern && !r.pattern.verified ? `below gate ${GATE_AUC}` : null),
    })),
    libraryBytes: b.libraryBytes, meanHeldAuc: b.meanHeldAuc,
  };
}

async function main() {
  const opts = cliOptions(process.argv.slice(2), fileURLToPath(new URL('../vendor/seed-library/data/', import.meta.url)));
  console.error(`\n◊ YOUR BRAIN — growing organs from ${opts.demo ? 'the demo data (UCI online-shoppers, standing in for your CSVs)' : opts.dataDir}\n` + '='.repeat(60));
  const run = growFromDir(opts.dataDir, opts.demo ? { cfg: { population: 24, elites: 4, generations: 16 } } : {});
  if (!run.ok) { console.error(`✗ ${run.error}`); process.exit(2); }
  for (const line of renderRun(run)) console.error(line);
  const b = run.brain;
  if (b.domains.length) {
    // one real thought: a held-out row from the first organ -> VERIFIED with a receipt, or ABSTAIN
    const first = firstVerified(run.results);
    const ds = datasetFromCsv(readFileSync(join(resolve(opts.dataDir), first.file), 'utf8'), first.name, {}).ds;
    const row = Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][ds.heldRows[0]]]));
    console.error(thinkLine(think(b, row), first.name));
    const junk = Object.fromEntries(ds.features.map((f) => [f, 99999]));
    console.error(`think(out-of-distribution junk)  -> ${think(b, junk).verdict}`);
  }
  const out = opts.outPath ? opts.outPath : fileURLToPath(new URL('../pattern-books/your-brain.json', import.meta.url));
  writeFileSync(out, JSON.stringify(reportFor(run, { dataDir: opts.demo ? 'demo' : opts.dataDir, grownAt: new Date().toISOString() }), null, 2));
  console.error(`\nreceipts written: ${out}\nthis brain is yours — the seeds re-grow it offline, on your metal, forever.\n`);
  process.exit(b.domains.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export default { datasetFromCsv, growOrgan, assembleBrain, think, growFromDir, cliOptions, renderRun, thinkLine, reportFor, firstVerified, errMsg, MIN_ROWS };
