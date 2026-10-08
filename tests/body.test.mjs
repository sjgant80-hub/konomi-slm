// tests/body.test.mjs — THE BODY: the cortex sizer picks the right model tier for the host's RAM, the plan is sane,
// and it is total. Deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostProfile, sizeModel, cortexPlan, body, ADDRESS_SPACE } from '../tools/body.mjs';

test('sizeModel picks the right tier across the hardware ladder', () => {
  assert.equal(sizeModel(15.7).tier, 'edge', 'a laptop runs the small cortex');
  assert.equal(sizeModel(24).tier, 'workstation');
  assert.equal(sizeModel(200).tier, 'cortex-M');
  assert.equal(sizeModel(256).tier, 'cortex-L');
  assert.equal(sizeModel(512).tier, 'cortex-XL', 'a 512 GB box runs the full cortex');
  assert.ok(/GLM-5.3 \(full\)/.test(sizeModel(512).model));
});

test('cortexPlan: tiny neurons mean any real machine holds the full 127-map; only a box runs the frontier model', () => {
  const laptop = cortexPlan(15.7), box = cortexPlan(512);
  assert.equal(laptop.neuronAddresses, ADDRESS_SPACE);
  assert.equal(laptop.runsFrontierModel, false);
  assert.equal(box.runsFrontierModel, true);
  assert.equal(box.hostsFullMap, true);
  assert.ok(Array.isArray(box.bringUp) && box.bringUp.length >= 3);
  assert.ok(box.bringUp.some((c) => /ollama pull/.test(c)), 'the box bring-up pulls the big model');
});

test('body() reports the real host and never throws', () => {
  const b = body();
  assert.ok(b.host.ramGB > 0 && b.host.cpus > 0);
  assert.equal(typeof b.isCortexBox, 'boolean');
  assert.equal(b.cortex.tier, sizeModel(b.host.ramGB).tier);
});

test('hostProfile reports this machine honestly', () => {
  const h = hostProfile();
  assert.ok(typeof h.host === 'string' && h.host.length > 0);
  assert.ok(h.ramGB > 0);
});
