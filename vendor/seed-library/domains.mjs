// domains.mjs — the SEED LIBRARY's domains: the real anchor + three realistic-synthetic survival domains.
//
// A domain is the LOCAL DATA a node already holds (its own sessions / sensor logs). It is NOT part of the
// library — the library is the tiny seeds. loadDomain() returns a dataset the ribosome germinates on:
//   { ok, name, title, note, real, features[], n, cols{feat:Float64Array}, y:Uint8Array, trainRows[], heldRows[] }
//
// HONESTY — what is real vs realistic-synthetic:
//   · shopper  — REAL data: the UCI Online Shoppers Purchasing Intention dataset (Sakar & Kastro, 2018,
//     CC BY 4.0), 12,330 real sessions, split by month (held-out = Nov+Dec). This is the one genuine labelled
//     dataset in the estate; it is the real-data anchor.
//   · triage, water, crop — REALISTIC-SYNTHETIC: generated deterministically from a KNOWN ground-truth rule
//     plus seeded Gaussian noise. They are NOT real-world measurements; they are an honest stand-in so the
//     "a tiny seed grows a build that generalises to held-out it never saw" claim can be MEASURED across
//     survival-critical domains (medical triage, drinking water, agriculture) the way a real ark would hold.
//     Train and held-out are disjoint draws from the SAME generator, so held-out generalisation is real; the
//     grown model never sees the held rows. The generating rule is printed in each domain's `note`.
// The generators and the parser are frozen by the seal's sha256 and re-derived by CI, so every result reproduces.
// Powered by the Konomi architecture, created by Thomas Frumkin.

// ── seeded RNG + a Gaussian (Box–Muller), for the synthetic generators ───────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// a deterministic held-out mask: 30% held, by row index (generation is i.i.d. of the label, so this is unbiased)
const splitByIndex = (n) => {
  const trainRows = [], heldRows = [];
  for (let i = 0; i < n; i++) (i % 10 < 3 ? heldRows : trainRows).push(i);
  return { trainRows, heldRows };
};

// build a dataset object from per-feature generators + a label rule
function synth(name, title, note, N, seed, featureNames, gen) {
  const cols = {};
  for (const f of featureNames) cols[f] = new Float64Array(N);
  const y = new Uint8Array(N);
  const r = rng(seed);
  for (let i = 0; i < N; i++) {
    const row = gen(r);                                  // { features..., latent } — latent is the ground-truth logit
    for (const f of featureNames) cols[f][i] = row[f];
    y[i] = row.latent + 1.0 * gauss(r) > 0 ? 1 : 0;      // noise blurs the boundary → held-out AUC < 1 (honest)
  }
  const { trainRows, heldRows } = splitByIndex(N);
  return { ok: true, name, title, note, real: false, features: featureNames, n: N, cols, y, trainRows, heldRows };
}

// ── triage: field medical triage (realistic-synthetic) ───────────────────────────────────────────────────────
const TRIAGE_NOTE = 'Field triage — critical=1. Ground-truth risk rises with low SpO₂, high respiratory & heart rate, '
  + 'low systolic BP, and fever (a simplified early-warning score). Realistic-synthetic, not real patients.';
export function loadTriage() {
  return synth('triage', 'Field triage', TRIAGE_NOTE, 2400, 101,
    ['heartRate', 'systolicBP', 'respRate', 'spO2', 'tempC', 'ageBand'], (r) => {
      const heartRate = clamp(80 + 20 * gauss(r), 35, 200);
      const systolicBP = clamp(120 + 20 * gauss(r), 60, 220);
      const respRate = clamp(16 + 5 * gauss(r), 6, 50);
      const spO2 = clamp(97 + 3 * gauss(r), 60, 100);
      const tempC = clamp(37 + 0.8 * gauss(r), 34, 42);
      const ageBand = clamp(3 + 2 * gauss(r), 0, 8);
      const latent = 0.09 * (92 - spO2) + 0.10 * (respRate - 20) + 0.04 * (115 - systolicBP)
        + 0.03 * (heartRate - 110) + 0.7 * (tempC - 38.2) + 0.12 * (ageBand - 5) - 0.2;
      return { heartRate, systolicBP, respRate, spO2, tempC, ageBand, latent };
    });
}

// ── water: drinking-water potability (realistic-synthetic) ───────────────────────────────────────────────────
const WATER_NOTE = 'Drinking water — potable=1. Ground-truth favours pH near 7, low turbidity, near-zero E. coli, '
  + 'moderate dissolved solids and some residual chlorine. Realistic-synthetic, not real samples.';
export function loadWater() {
  return synth('water', 'Water potability', WATER_NOTE, 2400, 202,
    ['ph', 'turbidity', 'tds', 'ecoli', 'chlorine', 'tempC'], (r) => {
      const ph = clamp(7.2 + 1.1 * gauss(r), 3, 11);
      const turbidity = clamp(2 + 1.8 * Math.abs(gauss(r)), 0, 20);
      const tds = clamp(350 + 180 * gauss(r), 20, 1500);
      const ecoli = clamp(Math.max(0, 6 * gauss(r)), 0, 80);
      const chlorine = clamp(0.8 + 0.5 * gauss(r), 0, 5);
      const tempC = clamp(18 + 6 * gauss(r), 1, 40);
      const latent = -1.4 * Math.abs(ph - 7.2) - 0.45 * turbidity - 0.22 * ecoli
        - 0.0022 * Math.abs(tds - 350) + 0.5 * Math.min(chlorine, 1.2) + 2.1;
      return { ph, turbidity, tds, ecoli, chlorine, tempC, latent };
    });
}

// ── crop: plant-now decision for a staple crop (realistic-synthetic) ─────────────────────────────────────────
const CROP_NOTE = 'Agriculture — plant-now=1. Ground-truth favours adequate soil moisture, soil temperature in a '
  + 'warm band, low frost risk, forecast rain and enough nitrogen. Realistic-synthetic, not real fields.';
export function loadCrop() {
  return synth('crop', 'Crop planting', CROP_NOTE, 2400, 303,
    ['soilMoisture', 'soilTempC', 'forecastRain', 'dayLength', 'nitrogen', 'frostRisk'], (r) => {
      const soilMoisture = clamp(40 + 15 * gauss(r), 0, 100);
      const soilTempC = clamp(18 + 6 * gauss(r), -5, 40);
      const forecastRain = clamp(Math.max(0, 8 + 10 * gauss(r)), 0, 80);
      const dayLength = clamp(12 + 2.5 * gauss(r), 6, 18);
      const nitrogen = clamp(50 + 20 * gauss(r), 0, 140);
      const frostRisk = clamp(Math.max(0, 0.3 + 0.4 * gauss(r)), 0, 2);
      const latent = 0.06 * (soilMoisture - 38) - 0.10 * Math.abs(soilTempC - 20) + 0.04 * forecastRain
        + 0.25 * (dayLength - 11) + 0.02 * (nitrogen - 45) - 2.3 * frostRisk + 0.3;
      return { soilMoisture, soilTempC, forecastRain, dayLength, nitrogen, frostRisk, latent };
    });
}

// ── shopper: the REAL UCI Online Shoppers dataset, split by month (fall-spore / pattern-organs protocol) ──────
export const SHOPPER_FEATURES = ['Administrative', 'Administrative_Duration', 'Informational', 'Informational_Duration',
  'ProductRelated', 'ProductRelated_Duration', 'BounceRates', 'ExitRates', 'PageValues', 'SpecialDay'];
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, June: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const HELD = new Set([11, 12]);
const SHOPPER_NOTE = 'REAL data — purchase=1. UCI Online Shoppers Purchasing Intention (Sakar & Kastro, 2018, '
  + 'DOI 10.24432/C5F88Q, CC BY 4.0): 12,330 real sessions; held-out = November + December, grown only on Feb–Oct.';
const NUM = /^-?\d+(\.\d+)?(E-?\d+)?$/i;

export function loadShopper(csvText) {
  if (typeof csvText !== 'string') return { ok: false, error: 'shopper needs the CSV text' };
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no sessions' };
  const head = lines[0].split(',');
  const need = [...SHOPPER_FEATURES, 'Month', 'Revenue'];
  const missing = need.filter((c) => !head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const idx = Object.fromEntries(head.map((h, k) => [h, k]));
  const n = lines.length - 1;
  const cols = {};
  for (const f of SHOPPER_FEATURES) cols[f] = new Float64Array(n);
  const y = new Uint8Array(n), trainRows = [], heldRows = [];
  for (let i = 0; i < n; i++) {
    const cells = lines[i + 1].split(',');
    if (cells.length !== head.length) return { ok: false, error: 'session ' + (i + 1) + ' has ' + cells.length + ' cells, not ' + head.length };
    for (const f of SHOPPER_FEATURES) {
      const raw = cells[idx[f]];
      if (!NUM.test(raw)) return { ok: false, error: 'session ' + (i + 1) + ': ' + f + ' is not a number' };
      cols[f][i] = Number(raw);
    }
    const m = MONTHS[cells[idx.Month]];
    if (!Number.isInteger(m)) return { ok: false, error: 'session ' + (i + 1) + ': unknown month' };
    const rev = cells[idx.Revenue];
    if (rev !== 'TRUE' && rev !== 'FALSE') return { ok: false, error: 'session ' + (i + 1) + ': Revenue is not TRUE or FALSE' };
    y[i] = Number(rev === 'TRUE');
    (HELD.has(m) ? heldRows : trainRows).push(i);
  }
  return { ok: true, name: 'shopper', title: 'Online shoppers', note: SHOPPER_NOTE, real: true, features: SHOPPER_FEATURES, n, cols, y, trainRows, heldRows };
}

// ── the registry ─────────────────────────────────────────────────────────────────────────────────────────────
export const DOMAIN_IDS = ['shopper', 'triage', 'water', 'crop'];
export const DOMAIN_META = {
  shopper: { title: 'Online shoppers', real: true, survival: 'commerce (the real-data anchor)', note: SHOPPER_NOTE },
  triage: { title: 'Field triage', real: false, survival: 'medical', note: TRIAGE_NOTE },
  water: { title: 'Water potability', real: false, survival: 'water', note: WATER_NOTE },
  crop: { title: 'Crop planting', real: false, survival: 'agriculture', note: CROP_NOTE },
};

// load one domain. shopper needs the CSV text (ctx.shopperCsv); the synthetic domains need nothing. Total.
export function loadDomain(name, ctx = {}) {
  if (name === 'shopper') return loadShopper(ctx.shopperCsv);
  if (name === 'triage') return loadTriage();
  if (name === 'water') return loadWater();
  if (name === 'crop') return loadCrop();
  return { ok: false, error: 'unknown domain: ' + name };
}
