// tools/corpus.mjs — THE CORPUS PATH: pattern-organs for TEXT domains (science, philosophy).
//
// A domain's "material" here is STATEMENTS, not tabular rows. Each statement is turned into interpretable MARKER
// features (how often each marker term appears), so the forge's gate can grade a pattern on held-out statements the
// same deterministic way it grades tabular ones — and the pattern-book comes out readable ("statements invoking
// 'observation' → empiricist"), not an embedding black box.
//
// HONESTY: these corpora are REALISTIC-SYNTHETIC — statements are generated deterministically from a KNOWN, CITED
// taxonomy (Popper's falsifiability criterion for science; the classic empiricism↔rationalism epistemology split for
// philosophy) plus cross-class distractors and label noise, so held-out generalisation is real (train and held are
// disjoint draws from the same generator) but they are NOT a scraped corpus of real quotes. Sourcing a real,
// cited corpus (public-domain texts, SEP-style taxonomies) is the next rung, stated plainly. The marker VOCABULARY
// is deliberately broader than the generator uses, so the organ must DISCOVER which markers actually predict.
// Powered by the Konomi architecture, created by Thomas Frumkin.

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const splitByIndex = (n) => { const trainRows = [], heldRows = []; for (let i = 0; i < n; i++) (i % 10 < 3 ? heldRows : trainRows).push(i); return { trainRows, heldRows }; };

// ── two cited taxonomies, each as class word-pools + templates ───────────────────────────────────────────────
const TAX = {
  science: {
    title: 'Scientific demarcation', label1: 'the claim is falsifiable (scientific)',
    note: 'Science — falsifiable=1. Ground truth: Popper\'s demarcation criterion — a claim is scientific if it forbids an '
      + 'observable outcome (testable, predictive, measurable). Realistic-synthetic, generated from that cited rule.',
    pos: ['predicts', 'is testable', 'can be measured', 'forbids the observation', 'would be refuted if', 'makes a measurable prediction', 'can be falsified by experiment'],
    neg: ['is true by its very nature', 'holds in all possible worlds', 'is a matter of destiny', 'cannot be observed in principle', 'is inherently beyond measurement', 'is a timeless spiritual truth', 'explains everything and forbids nothing'],
    subj: ['this hypothesis', 'the theory', 'the model', 'the proposed law', 'the claim', 'the account'],
  },
  philosophy: {
    title: 'Epistemology — empiricism vs rationalism', label1: 'the position is empiricist',
    note: 'Philosophy — empiricist=1. Ground truth: the classic epistemology split — empiricism grounds knowledge in '
      + 'sense experience and observation, rationalism in reason, deduction and a priori / innate ideas. Realistic-synthetic, from that cited distinction.',
    pos: ['knowledge comes from observation and experience', 'we learn only through the senses and evidence', 'ideas trace back to perception', 'claims are settled by experiment and observed data', 'the mind begins as a blank slate filled by experience'],
    neg: ['knowledge comes from reason alone', 'some ideas are innate and known a priori', 'truth is reached by deduction and pure thought', 'the intellect grasps self-evident principles by intuition', 'logic, not the senses, secures certainty'],
    subj: ['this position holds that', 'the philosopher argues that', 'on this view', 'the doctrine states that', 'it is maintained that'],
  },
};
// one shared marker vocabulary per domain (≤16), broader than the generator uses — the organ must find the signal
const MARKERS = {
  science: ['predict', 'test', 'measur', 'observ', 'refut', 'falsif', 'experiment', 'forbid', 'nature', 'destiny', 'timeless', 'spiritual', 'everything', 'possible', 'inherent', 'theory'],
  philosophy: ['observ', 'experience', 'sense', 'evidence', 'perception', 'experiment', 'reason', 'innate', 'priori', 'deduction', 'intuition', 'logic', 'pure', 'self-evident', 'mind', 'knowledge'],
};

export function generateStatements(domain, N, seed) {
  const t = TAX[domain]; const r = rng(seed); const out = [];
  for (let i = 0; i < N; i++) {
    const cls = r() < 0.5 ? 1 : 0;
    const core = cls ? pick(r, t.pos) : pick(r, t.neg);
    let s = `${pick(r, t.subj)} ${core}`;
    if (r() < 0.25) s += `, and ${cls ? pick(r, t.neg) : pick(r, t.pos)}`; // cross-class distractor (noise)
    const label = r() < 0.08 ? (cls ^ 1) : cls;                            // ~8% label noise → held-out AUC < 1 (honest)
    out.push({ text: s + '.', y: label });
  }
  return out;
}

// statement → marker-count feature vector; returns the forge's dataset shape
export function loadCorpus(domain, { n = 1600, seed = domain === 'science' ? 2026 : 2027 } = {}) {
  const t = TAX[domain]; if (!t) return { ok: false, error: 'unknown corpus domain: ' + domain };
  const markers = MARKERS[domain];
  const rows = generateStatements(domain, n, seed);
  const cols = {}; for (const m of markers) cols[m] = new Float64Array(n);
  const y = new Uint8Array(n);
  rows.forEach((row, i) => {
    const low = row.text.toLowerCase();
    for (const m of markers) { let c = 0, k = 0; while ((k = low.indexOf(m, k)) !== -1) { c++; k += m.length; } cols[m][i] = c; }
    y[i] = row.y;
  });
  const { trainRows, heldRows } = splitByIndex(n);
  return { ok: true, name: domain, title: t.title, note: t.note, real: false, features: markers, n, cols, y, trainRows, heldRows, label1: t.label1, _samples: rows.slice(0, 6) };
}

export const CORPUS_IDS = ['science', 'philosophy'];
