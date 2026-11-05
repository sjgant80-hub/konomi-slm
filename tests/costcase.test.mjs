// tests/costcase.test.mjs — the For-business cost case: every figure from the sourced basis, floors not top ends, like
// for like, never a throw. Mirrors liveware's test/mintcase.test.mjs for the same method. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULTS, BASIS_KEYS, BASIS_PATH, sourcesOf, over, costCase } from '../costcase.mjs';

const RAW = readFileSync(new URL('../' + BASIS_PATH, import.meta.url));
const BASIS = JSON.parse(RAW.toString('utf8'));
const base = (patch) => ({ ...BASIS, ...patch });

test('the basis is the vendored one, byte for byte', () => {
  assert.equal(createHash('sha256').update(RAW).digest('hex'), '83e9c2effa2f81596dcfa7110f030940032c1910cdf928d27d628ae59d73bb42');
  assert.equal(BASIS_PATH, 'vendor/sovereign-enterprise/data/basis.json');
});

test('costCase · the default case, every line from the sourced basis', () => {
  const r = costCase(BASIS, {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.inputs, { ...DEFAULTS });
  assert.deepEqual({ ...DEFAULTS }, { casesPerWeek: 500, minutesPerCase: 3, share: 0.5, seats: 5, tokensIn: 1500, tokensOut: 300, years: 3 });
  assert.deepEqual(r.lines, { hoursPerWeek: 25, staff: 25571, takenOff: 12785.5, seats: 1386, api: 117.62, power: 32.21 });
  assert.deepEqual(r.perYear, { today: 25571, rentSeats: 26957, cloudApi: 12903.12, own: 12817.71 });
  assert.deepEqual(r.over, { today: 79115.68, rentSeats: 83403.91, cloudApi: 39921.75, own: 39657.49 });
  assert.deepEqual([r.savingPerYear, r.savingOver, r.versusCloudOver], [12753.29, 39458.19, 264.26]);
  assert.equal(costCase(BASIS).ok, true, 'no input is the default input');
});

test('costCase · like for like: rented licences take nothing off; cloud and owned take the same share off', () => {
  const r = costCase(BASIS, { casesPerWeek: 1000, minutesPerCase: 6, share: 0.8, seats: 2, tokensIn: 2000, tokensOut: 500 });
  assert.deepEqual(r.lines, { hoursPerWeek: 100, staff: 102284, takenOff: 81827.2, seats: 554.4, api: 352.85, power: 32.21 });
  assert.deepEqual(r.perYear, { today: 102284, rentSeats: 102838.4, cloudApi: 20809.65, own: 20489.01 });
  assert.equal(r.perYear.rentSeats, Math.round((r.lines.staff + r.lines.seats) * 100) / 100);
  assert.equal(r.perYear.cloudApi, Math.round((r.lines.staff - r.lines.takenOff + r.lines.api) * 100) / 100);
  assert.equal(r.perYear.own, Math.round((r.lines.staff - r.lines.takenOff + r.lines.power) * 100) / 100);
  assert.equal(r.lines.seats, Math.round(2 * 12 * BASIS['seat.copilot'].value * 100) / 100);
  assert.deepEqual([r.savingPerYear, r.savingOver, r.versusCloudOver], [81794.99, 253070.51, 992.05]);
});

test('costCase · the figures move with the basis, not with anything typed', () => {
  const dear = costCase(base({ wageMedianHourly: { ...BASIS.wageMedianHourly, value: 30 } }), {});
  assert.equal(dear.lines.staff, 25 * 52 * 30);
  const cheapPower = costCase(base({ electricityPencePerKwh: { ...BASIS.electricityPencePerKwh, value: 10 } }), {});
  assert.equal(cheapPower.lines.power, Math.round(15 * 8760 / 1000 * 10 / 100 * 100) / 100);
  const watts = costCase(base({ laptopExtraWatts: { ...BASIS.laptopExtraWatts, value: 30 } }), {});
  assert.equal(watts.lines.power, Math.round(30 * 8760 / 1000 * 24.51 / 100 * 100) / 100);
  const hours = costCase(base({ hoursPerYear: { value: 4380 } }), {});
  assert.equal(hours.lines.power, Math.round(15 * 4380 / 1000 * 24.51 / 100 * 100) / 100);
  const fx = costCase(base({ fxGbpPerUsd: { ...BASIS.fxGbpPerUsd, value: 1 } }), {});
  assert.equal(fx.lines.api, Math.round(500 * 52 * (1500 * 2 + 300 * 10) / 1e6 * 100) / 100);
  const api = costCase(base({ frontier: { ...BASIS.frontier, inPerM: 4, outPerM: 20 } }), {});
  assert.equal(api.lines.api, Math.round(500 * 52 * (1500 * 4 + 300 * 20) / 1e6 * 0.75396 * 100) / 100);
  const seat = costCase(base({ 'seat.copilot': { ...BASIS['seat.copilot'], value: 10 } }), {});
  assert.equal(seat.lines.seats, 600);
  const flatCpi = costCase(base({ cpi: { ...BASIS.cpi, value: 0 } }), {});
  assert.equal(flatCpi.over.today, 25571 * 3);
});

test('costCase · boundaries hold at both ends of every input', () => {
  for (const ok of [{ casesPerWeek: 0 }, { casesPerWeek: 1e6 }, { minutesPerCase: 0 }, { minutesPerCase: 480 }, { share: 0 }, { share: 1 },
    { seats: 0 }, { years: 1 }, { years: 10 }, { tokensIn: 0, tokensOut: 0 }]) assert.equal(costCase(BASIS, ok).ok, true, JSON.stringify(ok));
  assert.equal(costCase(BASIS, { share: 1 }).perYear.own, costCase(BASIS, { share: 1 }).lines.power);
  assert.equal(costCase(BASIS, { share: 0 }).savingPerYear, -32.21);
  assert.equal(costCase(BASIS, { years: 1 }).over.today, 25571);
  assert.equal(costCase(BASIS, { minutesPerCase: 0 }).lines.staff, 0);
});

test('costCase · each bad input refused with its reason', () => {
  const why = (i) => costCase(BASIS, i).why;
  assert.equal(why({ casesPerWeek: 1e6 + 1 }), 'cases a week: 0 to 1,000,000');
  assert.equal(why({ casesPerWeek: -1 }), 'cases a week: 0 to 1,000,000');
  assert.equal(why({ casesPerWeek: '500' }), 'cases a week: 0 to 1,000,000');
  assert.equal(why({ minutesPerCase: 480.5 }), 'minutes a case: 0 to 480');
  assert.equal(why({ minutesPerCase: -0.1 }), 'minutes a case: 0 to 480');
  assert.equal(why({ minutesPerCase: NaN }), 'minutes a case: 0 to 480');
  assert.equal(why({ share: 1.01 }), 'the share of cases it answers: 0 to 1');
  assert.equal(why({ share: -0.1 }), 'the share of cases it answers: 0 to 1');
  assert.equal(why({ seats: 2.5 }), 'licences: a whole number');
  assert.equal(why({ seats: -1 }), 'licences: a whole number');
  assert.equal(why({ tokensIn: NaN }), 'tokens: numbers');
  assert.equal(why({ tokensOut: 'x' }), 'tokens: numbers');
  assert.equal(why({ tokensIn: -1 }), 'tokens: numbers');
  assert.equal(why({ years: 0 }), 'years: 1 to 10');
  assert.equal(why({ years: 11 }), 'years: 1 to 10');
  assert.equal(why({ years: 2.5 }), 'years: 1 to 10');
});

test('costCase · refuses a basis missing any figure it reads', () => {
  const refused = { ok: false, why: 'a sourced basis with every figure the case reads' };
  assert.deepEqual(costCase(null, {}), refused);
  for (const k of BASIS_KEYS) { const b = { ...BASIS }; delete b[k]; assert.deepEqual(costCase(b, {}), refused, k); }
  assert.deepEqual(costCase(base({ cpi: { value: -0.1 } }), {}), refused);
  assert.deepEqual(costCase(base({ frontier: { inPerM: 2 } }), {}), refused);
  assert.deepEqual(costCase(base({ wageMedianHourly: { value: Infinity } }), {}), refused);
  assert.deepEqual(costCase(base({ fxGbpPerUsd: { value: '0.75' } }), {}), refused);
});

test('over · CPI on every year after the first, compounding', () => {
  assert.equal(over(100, 0.1, 1), 100);
  assert.equal(over(100, 0.1, 2), 210);
  assert.equal(over(100, 0.1, 3), 331);
  assert.equal(over(100, 0, 4), 400);
  assert.equal(over(100, 0.1, 0), 0);
  assert.equal(over(1, 0.005, 2), 2.01);
});

test('sourcesOf · every figure the case reads, with what it is and where it came from', () => {
  const s = sourcesOf(BASIS);
  assert.deepEqual(s.map((x) => x.key), [...BASIS_KEYS]);
  assert.match(s.find((x) => x.key === 'wageMedianHourly').source, /^https:\/\/www\.ons\.gov\.uk\//);
  assert.equal(s.find((x) => x.key === 'seat.copilot').what, 'Microsoft 365 Copilot (enterprise)');
  assert.equal(s.find((x) => x.key === 'frontier').what, 'Claude Sonnet 5 (API)');
  assert.ok(s.filter((x) => x.key !== 'hoursPerYear').every((x) => /^https:\/\//.test(x.source)));
  assert.deepEqual(sourcesOf(null), []);
});

test('costCase · totality: garbage never throws', () => {
  const G = [undefined, null, 0, 'x', [], {}, { casesPerWeek: {} }, { years: Infinity }, true, () => 1];
  for (const a of G) for (const b of G) assert.doesNotThrow(() => costCase(a, b));
  for (const g of G) { assert.doesNotThrow(() => sourcesOf(g)); assert.doesNotThrow(() => over(g, g, 3)); }
  assert.equal(costCase(BASIS, { casesPerWeek: {} }).ok, false);
  const hostile = { get wageMedianHourly() { throw new Error('boom'); } };
  assert.deepEqual(costCase(hostile, {}), { ok: false, why: 'the inputs could not be read' });
});
