// tools/multiplier-arms.mjs — the three Konomi arms of THE MULTIPLIER test (CLAIMS-MULTIPLIER.md), re-derived with no model.
//
//   KF  the shipped shopper pattern book: tools/patternforge.mjs forgeOrgan, fed the hypotheses recorded in
//       pattern-books/shopper.receipt.json instead of asking a model. It must land on that receipt's hash exactly, or the
//       arm is refused. Its label comes from konomi-slm.mjs answer() over a library holding only this pattern.
//   K3  the tier-3 shopper pattern the ladder grows (buildLibrary, then growTier twice with no new domains).
//   K1  the tier-1 shopper pattern the live page grows (buildLibrary).
// Deterministic and slow (two deep searches, about a minute on a laptop), so it is kept out of the mutation-gated kernel;
// the checker runs it once on GitHub's runner. Powered by the Konomi architecture, created by Thomas Frumkin.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgeOrgan } from './patternforge.mjs';
import { hypothesesToGenome } from './propose-local.mjs';
import { buildLibrary, answer, scoreInput } from '../konomi-slm.mjs';
import { growTier } from '../grow-tier.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const LABEL1 = 'the visitor makes a purchase';
export const PROVENANCE = 'UCI Online Shoppers Purchasing Intention (Sakar & Kastro, 2018, CC BY 4.0) — REAL, 12,330 sessions';

export function shopperContext() {
  return { shopperCsv: fs.readFileSync(here('../vendor/seed-library/data/online_shoppers_intention.csv'), 'utf8') };
}
export const sessionOf = (ds, i) => Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][i]]));

/** derive KF, K3 and K1 on the shopper domain. Returns { ok, ds, patterns: {KF,K3,K1}, kfReceiptMatches, kfReceipt } */
export async function konomiArms(ctx = shopperContext()) {
  const ds = loadDomain('shopper', ctx);
  if (!ds || ds.ok === false) return { ok: false, why: (ds && ds.error) || 'shopper did not load' };
  const kfReceipt = JSON.parse(fs.readFileSync(here('../pattern-books/shopper.receipt.json'), 'utf8'));
  const recorded = async (d) => ({ ok: true, model: kfReceipt.proposer, hypotheses: kfReceipt.hypotheses, genome: hypothesesToGenome(kfReceipt.hypotheses, d.features) });
  const kf = await forgeOrgan(ds, { label1: LABEL1, proposer: recorded, provenance: PROVENANCE });
  if (!kf.ok) return { ok: false, why: kf.error };
  const kfReceiptMatches = kf.receipt.receiptHash === kfReceipt.receiptHash;
  const t1 = buildLibrary(['shopper'], ctx);
  const t3 = growTier(growTier(t1, { ctx, newDomains: [] }), { ctx, newDomains: [] });
  return { ok: kfReceiptMatches, why: kfReceiptMatches ? null : 'KF did not re-derive to its shipped receipt', ds, kfReceipt, kfReceiptMatches, kfOwnedSeedBytes: kf.ownedSeedBytes,
    patterns: { KF: kf.pattern, K3: t3.patterns.shopper, K1: t1.patterns.shopper } };
}

/** each Konomi arm over the sample: scores from scoreInput; KF's labels from answer() (an ABSTAIN is null) */
export function konomiScores(arms, sample) {
  const out = {};
  for (const name of ['KF', 'K3', 'K1']) out[name] = { scores: sample.map((i) => scoreInput(arms.patterns[name], sessionOf(arms.ds, i))) };
  const lib = { patterns: { shopper: arms.patterns.KF } };
  const answers = sample.map((i) => answer(lib, sessionOf(arms.ds, i)));
  out.KF.labels = answers.map((a) => (a.verdict === 'VERIFIED' ? a.label : null));
  out.KF.abstained = answers.filter((a) => a.verdict !== 'VERIFIED').length;
  return out;
}
