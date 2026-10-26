// node/konomi-node.test.mjs — konomi-slm as a cell of the foundation: its skills, its answers, its genome, its seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { konomiNode, genomeOf, regrow, NAME } from './konomi-node.mjs';
import { makeIdentity } from '../vendor/fall-kit-core/identity.mjs';
import { receiptHolds, readCard } from '../vendor/fall-kit-core/node.mjs';
import { buildLibrary } from '../konomi-slm.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { makeSeed, encodeSeed } from '../vendor/seed-library/seedlib.mjs';

const library = buildLibrary();
const seed = (n) => new Uint8Array(32).fill(n);
const row = (domain, k) => { const d = loadDomain(domain, {}); const i = d.heldRows[k]; return Object.fromEntries(d.features.map((f) => [f, d.cols[f][i]])); };

test('the vendored foundation is exactly what its pin names', () => {
  const pin = JSON.parse(readFileSync(new URL('../vendor/fall-kit-core/FALL-KIT-CORE.json', import.meta.url), 'utf8'));
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  for (const [f, sha] of Object.entries(pin.files)) assert.equal(createHash('sha256').update(readFileSync(new URL('../vendor/fall-kit-core/' + f, import.meta.url))).digest('hex'), sha, f);
  assert.ok(Object.keys(pin.files).includes('node.mjs'));
});

test('a skill per verified domain; answers carry a receipt that re-hashes, or abstain', async () => {
  const { node, genome } = await konomiNode({ identity: await makeIdentity(seed(22)), library });
  assert.equal(node.name, NAME);
  const card = node.card();
  assert.deepEqual(card.skills, Object.keys(genome.seeds).sort());
  assert.ok(card.skills.length >= 1);
  assert.equal((await readCard(card)).ok, true);
  assert.deepEqual(card.genome, genome);
  const skill = card.skills[0];
  // answer through the node's own skill table: drive it as a peer would, by its exported genome's domains
  const { node: asker } = await konomiNode({ identity: await makeIdentity(seed(23)), library });
  await asker.pin(card); await node.pin(asker.card());
  let verified = 0, abstained = 0;
  for (let k = 0; k < 8; k++) {
    const a = await asker.ask(skill, row(skill, k));
    const r = await node.hear(a.bytes);
    const back = await asker.hear(r.replies[0].bytes);
    if (back.outcome === 'verified') { verified++; assert.equal(receiptHolds(back.answer), true); assert.equal(back.answer.domain, skill); }
    if (back.outcome === 'abstain') abstained++;
  }
  assert.ok(verified >= 1, 'in-distribution rows are answered');
  const empty = await asker.ask(skill, {});
  const e = await asker.hear((await node.hear(empty.bytes)).replies[0].bytes);
  assert.equal(e.outcome, 'abstain', 'an input no pattern covers is an abstain');
  assert.ok(verified + abstained === 8);
});

test('the genome re-grows the same patterns, and a changed genome does not', () => {
  const g = genomeOf(library);
  assert.equal(g.kind, 'konomi-slm/seeds');
  const r = regrow(g);
  assert.equal(r.same, true);
  for (const [domain, [was, now]] of Object.entries(r.ids)) assert.equal(was, now, domain);
  const domain = Object.keys(g.seeds)[0];
  assert.equal(regrow({ ...g, patterns: { ...g.patterns, [domain]: 'ffffffffffffffff' } }).same, false, 'another id');
  assert.equal(regrow({ ...g, seeds: { ...g.seeds, [domain]: 'not a seed' } }).same, false, 'a broken seed');
  assert.equal(regrow({ kind: 'x', seeds: {}, patterns: {} }).same, false, 'nothing to grow is not the same');
  assert.equal(regrow(null).same, false);
  const spaced = g.seeds[domain].replace(' ', '  ');
  assert.equal(regrow({ ...g, seeds: { ...g.seeds, [domain]: spaced } }).same, false, 'the genome must be exactly the seed it grows from');
  const ghost = encodeSeed(makeSeed({ domain: 'no-such-domain', seed: 7, grow: { population: 8, elites: 2, generations: 2 } }));
  const r2 = regrow({ kind: 'konomi-slm/seeds', seeds: { 'no-such-domain': ghost }, patterns: { 'no-such-domain': 'abcdabcdabcdabcd' } });
  assert.equal(r2.same, false, 'a well-signed seed for a domain this node does not hold grows nothing');
  assert.deepEqual(r2.ids['no-such-domain'], ['abcdabcdabcdabcd', null]);
});

test('the library handed in is the library the node answers from', async () => {
  const one = { ...library, patterns: { [Object.keys(genomeOf(library).seeds)[0]]: library.patterns[Object.keys(genomeOf(library).seeds)[0]] } };
  const { node } = await konomiNode({ identity: await makeIdentity(seed(24)), library: one });
  assert.deepEqual(node.card().skills, Object.keys(one.patterns));
  await assert.rejects(konomiNode({ library }), /identity/, 'a node needs an identity');
});
