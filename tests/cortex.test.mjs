// tests/cortex.test.mjs — THE CORTEX boots the body, thinks (verified or abstain), reports a live status, stays total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, think, status } from '../tools/cortex.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';

const CSV = fileURLToPath(new URL('../vendor/seed-library/data/online_shoppers_intention.csv', import.meta.url));
const ctx = { shopperCsv: fs.readFileSync(CSV, 'utf8') };
const cx = boot(ctx);

test('boot assembles the running cortex: library of organs + the host tier', () => {
  assert.equal(cx.ok, true);
  assert.ok(cx.library && cx.library.domains.length >= 4);
  assert.ok(cx.host.ramGB > 0);
  assert.ok(typeof cx.tier === 'string' && cx.model);
});

test('think: a real in-distribution case is VERIFIED, out-of-distribution ABSTAINS', () => {
  const ds = loadDomain('triage', ctx);
  const real = Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][ds.heldRows[0]]]));
  const junk = Object.fromEntries(ds.features.map((f) => [f, 99999]));
  assert.equal(think(cx, real).verdict, 'VERIFIED');
  assert.equal(think(cx, junk).verdict, 'ABSTAIN');
  assert.equal(think(null, real).ok, false);
});

test('status reports the live body with real counts', () => {
  const s = status(cx);
  assert.equal(s.live, true);
  assert.ok(s.organs >= 4);
  assert.equal(typeof s.tier, 'string');
  assert.ok(s.meanHeldAuc > 0.5);
});
