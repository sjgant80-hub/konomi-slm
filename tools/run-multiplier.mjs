// tools/run-multiplier.mjs — run THE MULTIPLIER test exactly as CLAIMS-MULTIPLIER.md seals it, and write the receipt.
//
//   node tools/run-multiplier.mjs            ask the local models (Ollama on this machine), resuming at the first
//                                             session without a recorded reply, then score and write the receipt
//   node tools/run-multiplier.mjs --rescore  rebuild the verdict from the replies already recorded; asks no model
//
// Sovereign: the models are the ones on this machine (qwen2.5:14b and qwen2.5:7b through Ollama); nothing leaves it.
// Every reply is recorded as received, with its attempt count and the SHA-256 of the exact prompt sent, so
// tools/check-multiplier.mjs can re-score every claim on GitHub's runner without asking a model again.
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSeal, sampleRows, promptFor, parseReply, modelLabel, modelScore, judge, MODEL_ARMS } from './multiplier.mjs';
import { konomiArms, konomiScores, sessionOf } from './multiplier-arms.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const OUT = here('../receipts/multiplier.json');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const RESCORE = process.argv.includes('--rescore');

const claimsText = fs.readFileSync(here('../CLAIMS-MULTIPLIER.md'), 'utf8');
const s = readSeal(claimsText);
if (!s.ok) { console.error('the seal could not be read: ' + s.why); process.exit(1); }
const seal = s.seal;
const MODEL_OF = { R14: 'qwen2.5:14b', R7: 'qwen2.5:7b', B7: 'qwen2.5:7b' };
const DIGEST_OF = { R14: seal.arms.R14.match(/digest ([0-9a-f]{64})/)[1], R7: seal.arms.R7.match(/digest ([0-9a-f]{64})/)[1] };
DIGEST_OF.B7 = DIGEST_OF.R7;
const book = fs.readFileSync(here('../pattern-books/shopper.mind-context.txt'), 'utf8');

console.log('\n◊ THE MULTIPLIER — re-deriving the Konomi arms (no model)…');
const arms = await konomiArms();
if (!arms.ok) { console.error('refused: ' + arms.why); process.exit(1); }
const ds = arms.ds;
const sample = sampleRows(ds.heldRows, ds.y);
const y = sample.map((i) => ds.y[i]);
const konomi = konomiScores(arms, sample);
console.log(`  KF re-derived to its shipped receipt: ${arms.kfReceiptMatches} · sample ${sample.length} sessions (${y.filter((v) => v === 1).length} purchases)`);

let rec = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
if (rec && rec.claimsSha256 !== sha(claimsText)) { console.error('the recorded run was made under a different claims file — refusing to mix them'); process.exit(1); }
if (!rec) {
  let sealCommit = null;
  try { sealCommit = execSync('git log --diff-filter=A --format=%H -- CLAIMS-MULTIPLIER.md', { cwd: here('..') }).toString().trim().split('\n').pop() || null; } catch { /* not a git checkout */ }
  rec = { kind: 'konomi-slm.multiplier.receipt', v: 1, claimsFile: 'CLAIMS-MULTIPLIER.md', claimsSha256: sha(claimsText), sealCommit,
    run: { startedAt: new Date().toISOString(), resumes: 0, cpu: os.cpus()[0] && os.cpus()[0].model, memoryGb: Math.round(os.totalmem() / 2 ** 30), platform: os.platform() },
    models: {}, replies: { R14: [], R7: [], B7: [] } };
} else if (!RESCORE && MODEL_ARMS.some((a) => rec.replies[a].length < sample.length)) rec.run.resumes++;

async function getJson(path, body) {
  const r = await fetch(OLLAMA + path, body ? { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(120000) } : { signal: AbortSignal.timeout(10000) });
  return r.json();
}
async function ask(model, prompt) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const j = await getJson('/api/generate', { model, prompt, stream: false, options: { temperature: 0, seed: 7, num_predict: 8 } });
      if (typeof j.response === 'string') return { reply: j.response.trim(), attempts: attempt };
    } catch { /* retried below */ }
  }
  return { reply: null, attempts: 3 };
}
const save = () => { fs.mkdirSync(here('../receipts'), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(rec, null, 1) + '\n'); };

if (!RESCORE) {
  const tags = await getJson('/api/tags');
  try { rec.run.ollama = (await getJson('/api/version')).version; } catch { /* optional */ }
  for (const a of MODEL_ARMS) {
    const m = (tags.models || []).find((x) => x.name === MODEL_OF[a]);
    if (!m || m.digest !== DIGEST_OF[a]) { console.error(`refused: ${MODEL_OF[a]} on this machine is not the sealed digest`); process.exit(1); }
    rec.models[a] = { name: m.name, digest: m.digest, sizeBytes: m.size, parameters: m.details && m.details.parameter_size, quantization: m.details && m.details.quantization_level };
  }
  for (const a of MODEL_ARMS) {
    const t0 = Date.now();
    for (let k = rec.replies[a].length; k < sample.length; k++) {
      const prompt = promptFor(seal, sessionOf(ds, sample[k]), a === 'B7' ? book : null);
      const r = await ask(MODEL_OF[a], prompt);
      rec.replies[a].push({ reply: r.reply, attempts: r.attempts, promptSha256: sha(prompt) });
      save();
      if ((k + 1) % 20 === 0) console.log(`  ${a} ${k + 1}/${sample.length}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
  rec.run.finishedAt = new Date().toISOString();
}

// ── score: the recorded replies through the sealed kernel ──
const models = {}, parsed = {};
for (const a of MODEL_ARMS) {
  const scores = rec.replies[a].map((x) => parseReply(x.reply));
  parsed[a] = scores.filter((v) => v !== null).length;
  models[a] = { scores: scores.map(modelScore), labels: scores.map(modelLabel), raw: scores };
}
const verdict = judge({ KF: konomi.KF, K3: konomi.K3, K1: konomi.K1, R14: models.R14, R7: models.R7, B7: models.B7 }, y, parsed);
rec.sample = sample;
rec.y = y;
rec.konomi = {
  KF: { scores: konomi.KF.scores, labels: konomi.KF.labels, abstained: konomi.KF.abstained, receiptMatches: arms.kfReceiptMatches, ownedSeedBytes: arms.kfOwnedSeedBytes, heldAucAll: arms.patterns.KF.heldAuc, rules: arms.patterns.KF.rules },
  K3: { scores: konomi.K3.scores, heldAucAll: arms.patterns.K3.heldAuc, rules: arms.patterns.K3.rules },
  K1: { scores: konomi.K1.scores, heldAucAll: arms.patterns.K1.heldAuc, rules: arms.patterns.K1.rules },
};
rec.parsed = Object.fromEntries(MODEL_ARMS.map((a) => [a, models[a].raw]));
rec.verdict = verdict;
rec.sizes = { KFownedSeedBytes: arms.kfOwnedSeedBytes, R14weightsBytes: rec.models.R14 && rec.models.R14.sizeBytes, R7weightsBytes: rec.models.R7 && rec.models.R7.sizeBytes };
save();

const P = (x) => console.log(x);
P('\nAUC on the 200 sessions: ' + Object.entries(verdict.auc).map(([k, v]) => `${k} ${v}`).join(' · '));
P('balanced accuracy: ' + Object.entries(verdict.balancedAccuracy).map(([k, v]) => `${k} ${v}`).join(' · '));
for (const c of verdict.claims) P(`  ${c.id} ${c.holds ? 'HELD  ' : 'FAILED'} ${c.diff !== undefined ? `diff ${c.diff}  95% [${c.lo}, ${c.hi}]` : JSON.stringify(c.parsed)}`);
P(`\nTHE MULTIPLIER (X1): ${verdict.multiplierProven ? 'PROVEN' : 'NOT PROVEN — kept on the record'}\nreceipt: receipts/multiplier.json\n`);
