// domains-ext.mjs — the KONOMI SLM's own extra verticals, for broadening the library tier-over-tier (polymath).
// Same contract as the vendored seed-library domains: loadDomainExt(name) -> { ok, name, title, note, real,
// features[], n, cols{feat:Float64Array}, y:Uint8Array, trainRows[], heldRows[] }. The vendored seed-library
// domains.mjs is left pristine; these are konomi-slm's own, so the ladder has new ground to grow into.
//
// HONESTY: these three are REALISTIC-SYNTHETIC — generated deterministically from a known ground-truth rule plus
// seeded Gaussian noise, so held-out generalisation is real (train and held are disjoint draws from the same
// generator and the grown pattern never sees the held rows) but they are NOT real-world measurements. The rule
// is printed in each note. The one REAL dataset in the stack stays the UCI shopper anchor in seed-library.
// Powered by the Konomi architecture, created by Thomas Frumkin.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const splitByIndex = (n) => { const trainRows = [], heldRows = []; for (let i = 0; i < n; i++) (i % 10 < 3 ? heldRows : trainRows).push(i); return { trainRows, heldRows }; };

function synth(name, title, note, N, seed, featureNames, gen) {
  const cols = {};
  for (const f of featureNames) cols[f] = new Float64Array(N);
  const y = new Uint8Array(N);
  const r = rng(seed);
  for (let i = 0; i < N; i++) {
    const row = gen(r);
    for (const f of featureNames) cols[f][i] = row[f];
    y[i] = row.latent + 1.0 * gauss(r) > 0 ? 1 : 0;
  }
  const { trainRows, heldRows } = splitByIndex(N);
  return { ok: true, name, title, note, real: false, features: featureNames, n: N, cols, y, trainRows, heldRows };
}

// ── fraud: card-transaction fraud (realistic-synthetic) ──────────────────────────────────────────────────────
const FRAUD_NOTE = 'Card fraud — fraud=1. Ground-truth risk rises with large amounts, late-night hour, distance from '
  + 'home, a burst of recent transactions, higher merchant risk and card-not-present. Realistic-synthetic.';
export function loadFraud() {
  return synth('fraud', 'Card fraud', FRAUD_NOTE, 2400, 404,
    ['amount', 'hourOfDay', 'distanceKm', 'recentTx', 'merchantRisk', 'cardNotPresent'], (r) => {
      const amount = clamp(Math.max(0, 60 + 90 * gauss(r)), 0, 5000);
      const hourOfDay = clamp(13 + 6 * gauss(r), 0, 23);
      const distanceKm = clamp(Math.max(0, 8 + 40 * Math.abs(gauss(r))), 0, 3000);
      const recentTx = clamp(Math.max(0, 2 + 2 * Math.abs(gauss(r))), 0, 40);
      const merchantRisk = clamp(0.3 + 0.25 * gauss(r), 0, 1);
      const cardNotPresent = r() < 0.4 ? 1 : 0;
      const latent = 0.004 * (amount - 120) + 0.10 * Math.max(0, 2 - hourOfDay) + 0.09 * Math.max(0, hourOfDay - 22)
        + 0.003 * distanceKm + 0.12 * (recentTx - 4) + 1.8 * (merchantRisk - 0.5) + 0.8 * cardNotPresent - 1.0;
      return { amount, hourOfDay, distanceKm, recentTx, merchantRisk, cardNotPresent, latent };
    });
}

// ── maintenance: predictive machine failure (realistic-synthetic) ────────────────────────────────────────────
const MAINT_NOTE = 'Predictive maintenance — failure-soon=1. Ground-truth risk rises with high vibration, high '
  + 'temperature, long time since service, sustained high load, machine age and rising error rate. Realistic-synthetic.';
export function loadMaintenance() {
  return synth('maintenance', 'Predictive maintenance', MAINT_NOTE, 2400, 505,
    ['vibration', 'tempC', 'hoursSinceService', 'loadPct', 'ageMonths', 'errorRate'], (r) => {
      const vibration = clamp(Math.max(0, 2 + 1.2 * Math.abs(gauss(r))), 0, 20);
      const tempC = clamp(55 + 12 * gauss(r), 10, 120);
      const hoursSinceService = clamp(Math.max(0, 400 + 250 * gauss(r)), 0, 3000);
      const loadPct = clamp(65 + 18 * gauss(r), 0, 100);
      const ageMonths = clamp(Math.max(0, 36 + 24 * gauss(r)), 0, 240);
      const errorRate = clamp(Math.max(0, 0.5 + 0.6 * Math.abs(gauss(r))), 0, 20);
      const latent = 0.35 * (vibration - 3) + 0.05 * (tempC - 62) + 0.0016 * (hoursSinceService - 450)
        + 0.03 * (loadPct - 60) + 0.012 * (ageMonths - 36) + 0.5 * (errorRate - 1.0) - 1.6;
      return { vibration, tempC, hoursSinceService, loadPct, ageMonths, errorRate, latent };
    });
}

// ── credit: consumer loan default (realistic-synthetic) ──────────────────────────────────────────────────────
const CREDIT_NOTE = 'Consumer credit — default=1. Ground-truth risk rises with high debt-to-income, high credit '
  + 'utilisation, more delinquencies, lower income, higher loan-to-value and shorter employment. Realistic-synthetic.';
export function loadCredit() {
  return synth('credit', 'Loan default', CREDIT_NOTE, 2400, 606,
    ['dti', 'utilisation', 'delinquencies', 'incomeK', 'loanToValue', 'employMonths'], (r) => {
      const dti = clamp(0.35 + 0.15 * gauss(r), 0, 1.5);
      const utilisation = clamp(0.5 + 0.22 * gauss(r), 0, 1.5);
      const delinquencies = clamp(Math.max(0, Math.round(0.6 + 1.0 * Math.abs(gauss(r)))), 0, 12);
      const incomeK = clamp(Math.max(8, 42 + 18 * gauss(r)), 8, 300);
      const loanToValue = clamp(0.7 + 0.18 * gauss(r), 0, 1.4);
      const employMonths = clamp(Math.max(0, 48 + 36 * gauss(r)), 0, 480);
      const latent = 2.2 * (dti - 0.36) + 1.6 * (utilisation - 0.5) + 0.45 * (delinquencies - 0.8)
        - 0.02 * (incomeK - 42) + 1.5 * (loanToValue - 0.75) - 0.006 * (employMonths - 48) - 0.3;
      return { dti, utilisation, delinquencies, incomeK, loanToValue, employMonths, latent };
    });
}

export const EXT_IDS = ['fraud', 'maintenance', 'credit'];
export const EXT_META = {
  fraud: { title: 'Card fraud', real: false, survival: 'finance', note: FRAUD_NOTE },
  maintenance: { title: 'Predictive maintenance', real: false, survival: 'industry', note: MAINT_NOTE },
  credit: { title: 'Loan default', real: false, survival: 'finance', note: CREDIT_NOTE },
};
export function loadDomainExt(name) {
  if (name === 'fraud') return loadFraud();
  if (name === 'maintenance') return loadMaintenance();
  if (name === 'credit') return loadCredit();
  return { ok: false, error: 'unknown ext domain: ' + name };
}
