// scripts/csp.mjs — the live page's Content-Security-Policy, kept in step with its inline scripts. Pure: no file, no
// clock, no network; garbage in gives an empty list or null, never a throw. The command line is scripts/csp-write.mjs.
//
// The policy is what lets the brochure's security claims be enforced by the reader's browser, not just stated: the
// page may fetch only from the site that served it (connect-src 'self'), may run only its own module files and the
// inline scripts whose SHA-256 is listed (no 'unsafe-inline', no 'unsafe-eval'), and loads no plugin, frame or form
// target. tests/page-csp.test.mjs fails if an inline script changes without its hash being updated.
import { createHash } from 'node:crypto';

export const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/;

/** the text of every inline script the browser executes (a JSON-LD data block is not executed, so it is left out) */
export function inlineScripts(html) {
  return [...String(html).matchAll(/<script(?![^>]*application\/ld\+json)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1])).map((m) => m[2]);
}

/** the CSP hash source of one inline script, as a browser computes it (SHA-256 over its UTF-8 text, base64) */
export const hashOf = (text) => `'sha256-${createHash('sha256').update(String(text), 'utf8').digest('base64')}'`;

/** the whole policy for a page's html */
export function policyFor(html) {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...inlineScripts(html).map(hashOf)].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** the policy the page carries now, or null */
export function policyIn(html) {
  const m = String(html).match(META);
  return m ? m[1] : null;
}

/** the page with its policy brought in step, or null when it has no policy meta to update */
export function withPolicy(html) {
  const text = String(html);
  return META.test(text) ? text.replace(META, `<meta http-equiv="Content-Security-Policy" content="${policyFor(text)}" />`) : null;
}

export default { META, inlineScripts, hashOf, policyFor, policyIn, withPolicy };
