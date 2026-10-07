// tools/llm-duel.mjs — BONUS, UNGRADED, LLM-nondeterministic (kept out of the witness-gated core).
// A real head-to-head on the SAME held-out rows: the Konomi SLM's VERIFIED PATTERN vs a general small model
// (llama3.2:1b) asked zero-shot. Measures the thesis "a verified pattern beats a bigger general model on its
// domain". Honest: the LLM is not deterministic; this is a sampled receipt, re-runnable, not a witnessed number.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLibrary, answer } from '../konomi-slm.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const MODEL = process.env.DUEL_MODEL || 'llama3.2:1b';
const N = Number(process.env.DUEL_N || 30);
const DOMAIN = process.env.DUEL_DOMAIN || 'triage';
const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const lib = buildLibrary(['shopper', 'triage', 'water', 'crop'], ctx);

const ds = loadDomain(DOMAIN, ctx);
const sample = (rows, k) => { const s = Math.max(1, Math.floor(rows.length / k)); const o = []; for (let i = 0; i < rows.length && o.length < k; i += s) o.push(rows[i]); return o; };
const rows = sample(ds.heldRows, N);

const PROMPTS = {
  triage: (i) => `You are a field triage nurse. Given these vital signs, is the patient CRITICAL (needs immediate care)?
Heart rate: ${ds.cols.heartRate[i].toFixed(0)} bpm
Systolic BP: ${ds.cols.systolicBP[i].toFixed(0)} mmHg
Respiratory rate: ${ds.cols.respRate[i].toFixed(0)} /min
SpO2: ${ds.cols.spO2[i].toFixed(0)} %
Temperature: ${ds.cols.tempC[i].toFixed(1)} C
Answer with ONLY one word: YES or NO.`,
  shopper: (i) => `You are an e-commerce analyst. From this web session, will the visitor MAKE A PURCHASE?
Administrative pages: ${ds.cols.Administrative[i].toFixed(0)}
Product-related pages: ${ds.cols.ProductRelated[i].toFixed(0)}
Product-related duration: ${ds.cols.ProductRelated_Duration[i].toFixed(0)} s
Bounce rate: ${ds.cols.BounceRates[i].toFixed(3)}
Exit rate: ${ds.cols.ExitRates[i].toFixed(3)}
Page value: ${ds.cols.PageValues[i].toFixed(2)}
Answer with ONLY one word: YES or NO.`,
};
const prompt = PROMPTS[DOMAIN] || PROMPTS.triage;

async function ask(i) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', signal: ctl.signal,
      body: JSON.stringify({ model: MODEL, prompt: prompt(i), stream: false, options: { temperature: 0, num_predict: 6 } }),
    });
    const j = await r.json();
    const txt = String(j.response || '').toUpperCase();
    if (/\bYES\b/.test(txt)) return 1; if (/\bNO\b/.test(txt)) return 0; return txt.includes('CRIT') ? 1 : 0;
  } catch { return null; } finally { clearTimeout(t); }
}

// balanced accuracy = mean of per-class recall, so a majority-guess can't fake a win on imbalanced data
const balAcc = (hits, tot) => {
  const cls = [0, 1].filter((c) => tot[c] > 0);
  return cls.length ? cls.reduce((a, c) => a + hits[c] / tot[c], 0) / cls.length : 0;
};
(async () => {
  const patHit = { 0: 0, 1: 0 }, llmHit = { 0: 0, 1: 0 }, tot = { 0: 0, 1: 0 };
  let abst = 0, llmDone = 0, llmYes = 0, baseP = 0;
  for (const i of rows) {
    const truth = ds.y[i]; tot[truth]++; baseP += truth;
    const inp = Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][i]]));
    const a = answer(lib, inp);
    if (a.verdict === 'VERIFIED') { if (a.label === truth) patHit[truth]++; } else abst++;
    const l = await ask(i);
    if (l !== null) { llmDone++; if (l === 1) llmYes++; if (l === truth) llmHit[truth]++; }
  }
  const pct = (x) => (100 * x).toFixed(1) + '%';
  console.log(`\n◊ DUEL on ${DOMAIN} held-out (${rows.length} rows, SAME rows) — model=${MODEL}`);
  console.log(`  class balance: ${tot[1]} positive / ${tot[0]} negative  (base rate ${pct(baseP / rows.length)})`);
  console.log(`  Konomi SLM verified pattern : balanced-acc ${pct(balAcc(patHit, tot))}  (${abst} abstained)`);
  console.log(`  ${MODEL} zero-shot          : balanced-acc ${pct(balAcc(llmHit, tot))}  (said YES ${llmYes}/${llmDone} times)`);
  console.log(`  honest: balanced accuracy (per-class recall) so imbalance can't fake it; LLM non-deterministic — a sampled, re-runnable receipt.\n`);
})();
