// tests/your-brain.test.mjs — the product path: YOUR CSVs -> gated organs -> a booted brain.
// Everything here is deterministic (seeded growth over fixed fixture text), so these are exact
// pins, not flaky thresholds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { datasetFromCsv, growOrgan, assembleBrain, think, growFromDir, cliOptions, renderRun, thinkLine, reportFor, errMsg, MIN_ROWS } from '../tools/your-brain.mjs';

const FAST = { population: 12, elites: 3, generations: 8 };

// a seeded LCG so the fixtures are byte-stable
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function signalCsv(n = 240) {
  const r = lcg(7);
  const rows = ['spend,region,churned'];
  for (let i = 0; i < n; i++) {
    const spend = Math.floor(r() * 10);               // 0..9
    const region = r() < 0.5 ? 'north' : 'south';     // irrelevant
    rows.push(`${spend},${region},${spend >= 6 ? 'yes' : 'no'}`);  // the signal IS spend>=6
  }
  return rows.join('\n');
}
function noiseCsv(n = 600) {
  const r = lcg(99);
  const rows = ['alpha,beta,label'];
  for (let i = 0; i < n; i++) rows.push(`${Math.floor(r() * 10)},${Math.floor(r() * 10)},${r() < 0.5 ? 'yes' : 'no'}`);
  return rows.join('\n');
}

// ── datasetFromCsv: the adapter, honest about what it refuses ────────────────
test('a real CSV becomes a ribosome-shaped dataset with a stratified held-out split', () => {
  const d = datasetFromCsv(signalCsv(), 'churn', { target: 'churned' });
  assert.equal(d.ok, true);
  assert.equal(d.ds.n, 240);
  assert.equal(d.ds.targetName, 'churned');
  assert.ok(d.ds.features.length >= 2, 'spend + region levels encoded');
  assert.equal(d.ds.y.length, 240);
  assert.ok(d.ds.heldRows.length >= 80 && d.ds.heldRows.length <= 100, '≈40% held out');
  assert.equal(d.ds.heldRows.length + d.ds.trainRows.length, 240);
  // the split is deterministic: same text + name -> same rows
  const d2 = datasetFromCsv(signalCsv(), 'churn', { target: 'churned' });
  assert.deepEqual(d2.ds.heldRows, d.ds.heldRows);
  // and PINNED: these exact indices, from this exact seed derivation — a shifted seed is a bug
  assert.deepEqual(d.ds.heldRows.slice(0, 6), [2, 4, 11, 12, 17, 19]);
  assert.equal(d.ds.heldRows.length, 95);
});

test('the MIN_ROWS boundary is inside the allowed range: exactly 40 usable rows grows', () => {
  const r40 = 'spend,churned\n' + Array.from({ length: MIN_ROWS }, (_, i) => `${i % 10},${i % 10 >= 6 ? 'yes' : 'no'}`).join('\n');
  const d = datasetFromCsv(r40, 'edge', { target: 'churned' });
  assert.equal(d.ok, true, 'exactly MIN_ROWS rows is enough');
  assert.equal(d.ds.n, MIN_ROWS);
});

test('errMsg: an Error gives its message, a bare value gives itself', () => {
  assert.equal(errMsg(new Error('boom')), 'boom');
  assert.equal(errMsg('plain'), 'plain');
  assert.equal(errMsg(null), 'null');
});
test('too few rows, one-class targets and garbage are each refused with a reason, never grown', () => {
  const tiny = 'a,label\n' + Array.from({ length: 10 }, (_, i) => `${i},${i % 2 ? 'yes' : 'no'}`).join('\n');
  assert.match(datasetFromCsv(tiny, 't').error, new RegExp(`fewer than ${MIN_ROWS}`));
  // a one-class file dies in the vendored CSV kernel before our own one-class guard (0 usable
  // rows); the guard stays as defence-in-depth against vendor drift. What we pin is the refusal.
  const oneClass = 'a,label\n' + Array.from({ length: 60 }, (_, i) => `${i},yes`).join('\n');
  const o = datasetFromCsv(oneClass, 'o', { target: 'label' });
  assert.equal(o.ok, false);
  assert.ok(o.error && o.error.length > 10, 'a refusal always says why');
  assert.equal(datasetFromCsv('not,really\na', 'x').ok, false);
});

// ── growOrgan: signal earns a place, noise is CUT ────────────────────────────
test('a signal-bearing CSV grows a VERIFIED organ; pure noise is refused by the held-out gate', () => {
  const sig = datasetFromCsv(signalCsv(), 'churn', { target: 'churned' }).ds;
  const p = growOrgan(sig, { cfg: FAST });
  assert.equal(p.verified, true, `signal organ verified (heldAuc ${p.heldAuc})`);
  assert.ok(p.heldAuc > 0.9, `spend>=6 is a strong signal (got ${p.heldAuc})`);
  assert.ok(typeof p.seedStr === 'string' && p.seedStr.length > 0, 'the organ compresses to a seed');
  const noise = datasetFromCsv(noiseCsv(), 'static', { target: 'label' }).ds;
  const q = growOrgan(noise, { cfg: FAST });
  assert.equal(q.verified, false, `noise must NOT earn an organ (heldAuc ${q.heldAuc})`);
});

// ── assembleBrain + think: the owned brain answers with a receipt, or abstains ─
test('verified organs assemble into a brain; think() is VERIFIED on a held row, ABSTAIN on junk', () => {
  const sig = datasetFromCsv(signalCsv(), 'churn', { target: 'churned' }).ds;
  const p = growOrgan(sig, { cfg: FAST });
  const brain = assembleBrain([{ name: 'churn', pattern: p }, { name: 'static', error: 'no signal' }]);
  assert.equal(brain.ok, true);
  assert.deepEqual(brain.domains, ['churn']);
  assert.equal(brain.cut.length, 1);
  assert.match(brain.cut[0].why, /no signal/);
  assert.ok(brain.libraryBytes > 0);
  assert.equal(brain.meanHeldAuc, p.heldAuc);
  const row = Object.fromEntries(sig.features.map((f) => [f, sig.cols[f][sig.heldRows[0]]]));
  const t = think(brain, row);
  assert.equal(t.verdict, 'VERIFIED');
  assert.ok(t.receipt && /^[0-9a-f]{64}$/.test(t.receipt.receiptHash), 'a tamper-evident receipt rides every answer');
  assert.equal(think(brain, Object.fromEntries(sig.features.map((f) => [f, 99999]))).verdict, 'ABSTAIN');
  assert.equal(think(null, row).ok, false);
  assert.equal(assembleBrain([{ name: 'x', error: 'nope' }]).ok, false);
});

// ── the CLI seam and the report shape, pure and gate-covered ─────────────────
test('cliOptions: --demo wins, a positional names the dir, --out reads the NEXT arg', () => {
  assert.deepEqual(cliOptions(['--demo'], '/demo/dir'), { demo: true, dataDir: '/demo/dir', outPath: null });
  assert.deepEqual(cliOptions(['mydata'], '/demo/dir'), { demo: false, dataDir: 'mydata', outPath: null });
  assert.deepEqual(cliOptions([], '/demo/dir').dataDir, 'data');
  assert.equal(cliOptions(['mydata', '--out', 'r.json'], '/d').outPath, 'r.json');
});
test('renderRun says ✓ with the AUC for kept organs, ✗ CUT with the why, and the brain summary', () => {
  const run = {
    results: [
      { name: 'good', pattern: { verified: true, heldAuc: 0.87 }, held: 95, targetName: 'churned' },
      { name: 'bad', error: 'no signal here' },
      { name: 'weak', pattern: { verified: false, heldAuc: 0.51 } },
    ],
    brain: { domains: ['good'], libraryBytes: 79, meanHeldAuc: 0.87, gateAuc: 0.6 },
  };
  const lines = renderRun(run);
  assert.match(lines[0], /✓ organ good: held-out AUC 0\.87 on 95 rows/);
  assert.match(lines[1], /✗ CUT bad: no signal here/);
  assert.match(lines[2], /✗ CUT weak: held-out AUC 0\.51 below gate 0\.6/);
  assert.match(lines[3], /brain: 1 organ\(s\) · 79 B of seeds/);
});
test('firstVerified picks the first organ that EARNED the badge, never an unverified or errored one', async () => {
  const { firstVerified } = await import('../tools/your-brain.mjs');
  const kept = { name: 'b', pattern: { verified: true } };
  assert.equal(firstVerified([{ name: 'a', error: 'x' }, { name: 'w', pattern: { verified: false } }, kept]), kept);
  assert.equal(firstVerified([{ name: 'a', error: 'x' }]), null);
});

test('thinkLine carries the receipt prefix on VERIFIED and the bare verdict otherwise', () => {
  assert.equal(thinkLine({ verdict: 'VERIFIED', label: 1, receipt: { receiptHash: 'ab'.repeat(32) } }, 'churn'),
    'think(a held-out churn case) -> VERIFIED (label 1, receipt abababababab…)');
  assert.equal(thinkLine({ verdict: 'ABSTAIN' }, 'churn'), 'think(a held-out churn case) -> ABSTAIN');
});
test('reportFor: kept organs carry their seed and AUC, cut organs carry the why and a null seed', () => {
  const run = {
    results: [
      { name: 'good', file: 'g.csv', pattern: { verified: true, heldAuc: 0.87, seedStr: 'SEED' }, rows: 240, held: 95 },
      { name: 'bad', file: 'b.csv', error: 'no signal' },
      { name: 'weak', file: 'w.csv', pattern: { verified: false, heldAuc: 0.51 } },
    ],
    brain: { domains: ['good'], libraryBytes: 4, meanHeldAuc: 0.87, gateAuc: 0.6 },
  };
  const rep = reportFor(run, { dataDir: 'demo', grownAt: 'T' });
  assert.equal(rep.dataDir, 'demo');
  assert.equal(rep.grownAt, 'T');
  assert.deepEqual(rep.organs[0], { name: 'good', file: 'g.csv', verified: true, heldAuc: 0.87, rows: 240, held: 95, seed: 'SEED', cutWhy: null });
  assert.equal(rep.organs[1].seed, null);
  assert.equal(rep.organs[1].cutWhy, 'no signal');
  assert.equal(rep.organs[2].cutWhy, 'below gate 0.6');
  assert.equal(rep.organs[2].verified, false);
  assert.equal(rep.libraryBytes, 4);
});

// ── growFromDir: the whole product loop on a folder ──────────────────────────
test('a folder of CSVs becomes a brain: signal kept, noise cut, config targets honoured', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yourbrain-'));
  try {
    writeFileSync(join(dir, 'churn.csv'), signalCsv());
    writeFileSync(join(dir, 'static.csv'), noiseCsv());
    writeFileSync(join(dir, 'brain.config.json'), JSON.stringify({ targets: { 'churn.csv': 'churned', 'static.csv': 'label' } }));
    const run = growFromDir(dir, { cfg: FAST });
    assert.equal(run.ok, true);
    assert.equal(run.results.length, 2);
    assert.deepEqual(run.brain.domains, ['churn']);
    assert.equal(run.brain.cut.length, 1);
    assert.equal(run.brain.cut[0].organ, 'static');
    assert.equal(growFromDir(mkdtempSync(join(tmpdir(), 'empty-'))).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
