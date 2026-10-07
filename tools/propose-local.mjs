// tools/propose-local.mjs — THE NEURAL PROPOSER (sovereign, local, UNGRADED). Completes the neurosymbolic loop:
// a local model reads a domain and PROPOSES which features predict the positive class and in which direction;
// those hypotheses are compiled to a candidate genome that WARM-STARTS the growth engine's search. Nothing the
// model says is trusted — the gate (held-out) keeps only what predicts. The model is kept out of everything graded;
// it only proposes. Non-deterministic (a local LLM), so this is a tool + a sampled receipt, never a witnessed number.
//
// Runs against Ollama on the node's own metal (DUEL_MODEL env, default qwen2.5:7b). Powered by the Konomi architecture.
import { QGRID, WGRID, MAXRULES, MAXFEATS, stemGenome } from '../vendor/seed-library/seedlib.mjs';

const MODEL = process.env.PROPOSE_MODEL || 'qwen2.5:7b';
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

// sample a few labelled rows as compact text for the prompt (deterministic stride)
function sampleRows(ds, k) {
  const step = Math.max(1, Math.floor(ds.trainRows.length / k)), out = [];
  for (let i = 0; i < ds.trainRows.length && out.length < k; i += step) out.push(ds.trainRows[i]);
  return out;
}
function promptFor(ds, label1 = 'the positive outcome') {
  const feats = ds.features;
  const rows = sampleRows(ds, 14).map((i) => feats.map((f) => `${f}=${Number(ds.cols[f][i]).toFixed(2)}`).join(', ') + ` -> ${ds.y[i]}`);
  return `You are a data analyst. A dataset predicts a binary outcome (1 = ${label1}, 0 = not). `
    + `Features: ${feats.join(', ')}.\nLabelled examples (feature values -> outcome):\n${rows.join('\n')}\n\n`
    + `For each feature that helps predict outcome 1, say whether a HIGH or LOW value pushes toward 1. `
    + `Reply with ONLY a JSON array like [{"feature":"<name>","direction":"high"|"low"}], most important first, no prose.`;
}

export function parseHypotheses(text, feats) {
  const out = []; const seen = new Set();
  // try strict JSON first
  const m = String(text).match(/\[[\s\S]*\]/);
  if (m) { try { for (const h of JSON.parse(m[0])) { const f = feats.find((x) => x.toLowerCase() === String(h.feature).toLowerCase()); const d = /low|below|less|down/i.test(h.direction) ? 'low' : 'high'; if (f && !seen.has(f)) { seen.add(f); out.push({ feature: f, direction: d }); } } } catch { /* fall through */ } }
  // tolerant fallback: scan for "feature ... high/low"
  if (!out.length) {
    const t = String(text);
    for (const f of feats) { const i = t.toLowerCase().indexOf(f.toLowerCase()); if (i >= 0 && !seen.has(f)) { const near = t.slice(i, i + f.length + 40).toLowerCase(); seen.add(f); out.push({ feature: f, direction: /low|below|less|down/.test(near) ? 'low' : 'high' }); } }
  }
  return out.slice(0, MAXRULES);
}

// compile hypotheses -> a genome that warm-starts deepen(): one rule per hypothesis, mid-quantile threshold,
// side from the direction, a positive weight (a "high pushes to 1" rule fires on x > threshold; "low" on x <= threshold)
export function hypothesesToGenome(hyps, feats) {
  const g = { on: 0 };
  const midQ = Math.floor(QGRID.length / 2), wPos = Math.max(0, WGRID.indexOf(1));
  for (let r = 0; r < MAXRULES; r++) { g[`f${r}`] = r % MAXFEATS; g[`q${r}`] = midQ; g[`d${r}`] = 1; g[`w${r}`] = wPos; }
  hyps.forEach((h, r) => { if (r >= MAXRULES) return; const fi = feats.indexOf(h.feature); if (fi < 0) return; g.on |= 1 << r; g[`f${r}`] = fi % MAXFEATS; g[`q${r}`] = midQ; g[`d${r}`] = h.direction === 'high' ? 1 : 0; g[`w${r}`] = wPos; });
  if (!g.on) return stemGenome();
  return g;
}

export async function proposeGenome(ds, { model = MODEL, label1 = 'the positive outcome', timeoutMs = Number(process.env.PROPOSE_TIMEOUT) || 60000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', signal: ctl.signal,
      body: JSON.stringify({ model, prompt: promptFor(ds, label1), stream: false, options: { temperature: 0, num_predict: 400 } }) });
    const j = await r.json();
    const hyps = parseHypotheses(j.response || '', ds.features);
    return { ok: true, model, hypotheses: hyps, genome: hypothesesToGenome(hyps, ds.features), raw: (j.response || '').trim().slice(0, 500) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } finally { clearTimeout(t); }
}

export default { proposeGenome, parseHypotheses, hypothesesToGenome };
