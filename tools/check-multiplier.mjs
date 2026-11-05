// tools/check-multiplier.mjs — re-score THE MULTIPLIER receipt with no model, on GitHub's runner. Exit 1 on any difference.
//
// Checks, in order: CLAIMS-MULTIPLIER.md is byte for byte the file the run was made under (its SHA-256); the run is
// complete; the sealed model digests are the ones recorded; the sample re-derives from the data; the three Konomi arms
// re-derive (KF to its shipped receipt) and score every session as recorded; every recorded prompt hash is the hash of
// the sealed prompt for that session and arm; every recorded reply parses to the recorded score; and the verdict
// re-computed by the sealed kernel equals the recorded verdict, claim by claim. Run: node tools/check-multiplier.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readSeal, sampleRows, promptFor, parseReply, modelLabel, modelScore, judge, MODEL_ARMS } from './multiplier.mjs';
import { konomiArms, konomiScores, sessionOf } from './multiplier-arms.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const fail = (why) => { console.error('✗ multiplier receipt: ' + why); process.exit(1); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const claimsText = fs.readFileSync(here('../CLAIMS-MULTIPLIER.md'), 'utf8');
const rec = JSON.parse(fs.readFileSync(here('../receipts/multiplier.json'), 'utf8'));
if (rec.claimsSha256 !== sha(claimsText)) fail('CLAIMS-MULTIPLIER.md is not the file the run was made under (SHA-256 differs)');
const seal = readSeal(claimsText).seal;
if (!rec.run || !rec.run.finishedAt) fail('the run is not complete');
for (const a of MODEL_ARMS) {
  const sealed = seal.arms[a === 'B7' ? 'R7' : a].match(/digest ([0-9a-f]{64})/)[1];
  if (!rec.models[a] || rec.models[a].digest !== sealed) fail(`${a} was not the sealed model digest`);
}

const arms = await konomiArms();
if (!arms.ok) fail(arms.why);
const sample = sampleRows(arms.ds.heldRows, arms.ds.y);
if (!same(sample, rec.sample)) fail('the sample does not re-derive');
const y = sample.map((i) => arms.ds.y[i]);
if (!same(y, rec.y)) fail('the sample labels do not re-derive');
const konomi = konomiScores(arms, sample);
for (const k of ['KF', 'K3', 'K1']) if (!same(konomi[k].scores, rec.konomi[k].scores)) fail(`${k}'s scores do not re-derive`);
if (!same(konomi.KF.labels, rec.konomi.KF.labels) || konomi.KF.abstained !== rec.konomi.KF.abstained) fail("KF's answers do not re-derive");

const book = fs.readFileSync(here('../pattern-books/shopper.mind-context.txt'), 'utf8');
const models = {}, parsed = {};
for (const a of MODEL_ARMS) {
  const replies = rec.replies[a];
  if (!Array.isArray(replies) || replies.length !== sample.length) fail(`${a} does not have a reply for every session`);
  replies.forEach((r, k) => {
    if (r.promptSha256 !== sha(promptFor(seal, sessionOf(arms.ds, sample[k]), a === 'B7' ? book : null))) fail(`${a} session ${k}: the prompt sent was not the sealed prompt`);
    if (!(r.attempts >= 1 && r.attempts <= 3)) fail(`${a} session ${k}: more than the sealed three attempts`);
  });
  const scores = replies.map((r) => parseReply(r.reply));
  if (!same(scores, rec.parsed[a])) fail(`${a}: a recorded reply does not parse to its recorded score`);
  parsed[a] = scores.filter((v) => v !== null).length;
  models[a] = { scores: scores.map(modelScore), labels: scores.map(modelLabel) };
}
const verdict = judge({ KF: konomi.KF, K3: konomi.K3, K1: konomi.K1, R14: models.R14, R7: models.R7, B7: models.B7 }, y, parsed);
if (!same(verdict, rec.verdict)) fail('the verdict does not re-compute to the recorded one');

console.log(`✓ multiplier receipt re-scored with no model: ${verdict.claims.map((c) => `${c.id} ${c.holds ? 'held' : 'FAILED'}`).join(' · ')} — the multiplier ${verdict.multiplierProven ? 'PROVEN' : 'not proven (kept on the record)'}`);
