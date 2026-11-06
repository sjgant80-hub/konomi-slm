// tests/page-csp.test.mjs — the live page's security claims, enforced by the browser: its Content-Security-Policy must
// let it fetch only from its own site, run only its own files and the inline scripts listed by hash, and must be in
// step with those scripts (an edited script with a stale hash would not run, so CI catches it first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inlineScripts, hashOf, policyFor, policyIn, withPolicy } from '../scripts/csp.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const csp = policyIn(html);
const directive = (name) => (csp || '').split(';').map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name) || '';

test('index.html carries a Content-Security-Policy, in step with its inline scripts', () => {
  assert.ok(csp, 'no Content-Security-Policy meta in index.html');
  assert.equal(csp, policyFor(html), 'out of step: run node scripts/csp-write.mjs --write');
  assert.equal(withPolicy(html), html, 'writing the policy again changes nothing');
});

test('the page may fetch only from the site that served it', () => {
  assert.equal(directive('connect-src'), "connect-src 'self'");
  assert.equal(directive('default-src'), "default-src 'self'");
});

test('scripts: its own files and the hashed inline scripts only, never unsafe-inline or eval', () => {
  const s = directive('script-src');
  assert.ok(s.startsWith("script-src 'self' "), s);
  assert.doesNotMatch(s, /unsafe-inline|unsafe-eval|\*|https?:/);
  const listed = s.split(/\s+/).filter((t) => t.startsWith("'sha256-"));
  const scripts = inlineScripts(html);
  assert.ok(scripts.length >= 2, 'the page has its two module scripts');
  assert.deepEqual(listed, scripts.map(hashOf));
});

test('no plugins, frames, base rewrites or form targets', () => {
  for (const d of ['object-src', 'frame-src', 'base-uri', 'form-action']) assert.equal(directive(d), `${d} 'none'`);
});

test('the JSON-LD data block is not counted as a script, and a src script is not hashed', () => {
  const h = '<script type="application/ld+json">{"a":1}</script><script type="module">x()</script><script src="a.js"></script>';
  assert.deepEqual(inlineScripts(h), ['x()']);
  assert.equal(hashOf(''), "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
});

test('withPolicy brings a stale policy in step and refuses a page without one', () => {
  const page = '<meta http-equiv="Content-Security-Policy" content="stale" /><script type="module">go()</script>';
  const next = withPolicy(page);
  assert.equal(policyIn(next), policyFor(page));
  assert.ok(policyIn(next).includes(hashOf('go()')));
  assert.equal(withPolicy('<p>no policy here</p>'), null);
  assert.equal(policyIn('<p>no policy here</p>'), null);
  assert.deepEqual(inlineScripts(null), []);
});
