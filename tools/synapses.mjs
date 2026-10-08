// tools/synapses.mjs — SYNAPSES (queue #6). The organs are not a list, they are a MIND: links between organs that
// strengthen when they share verified structure and succeed together, weaken otherwise, and are pruned when too weak
// (the dream-gate). Pure, total, deterministic — no model, no network.
//
// A synapse weight between two organs blends two honest, measured signals, plus a Hebbian term that accumulates over
// real build receipts:
//   · SAME FIELD  — do the organs live in the same domain-field (finance, commerce, medical, epistemology, …)?
//   · SHARED STRUCTURE — cosine overlap of the significant terms in their verified pattern-books (so two organs whose
//     proven rules talk about the same things are linked; e.g. science ↔ philosophy share observe/evidence/experiment).
//   · HEBBIAN — hebbianUpdate() nudges a link up on a co-success build receipt (a cross-breed that beat both parents,
//     a transfer that predicted) and down on a co-failure. Organs that succeed together wire together.
// prune() is the dream-gate: edges below the floor are cut, so the graph keeps only links that earned their place.
// Powered by the Konomi architecture, created by Thomas Frumkin.

const STOP = new Set(('when is above below at or the makes more less likely weight held out auc accuracy cases source '
  + 'verified every rule kept only because set predicted that never saw and to of in for pattern book predicts data '
  + 'realistic synthetic from known generated this position holds view states argues doctrine claim it maintained with '
  + 'a an on by be are was').split(/\s+/));

export function termVector(text) {
  const v = {};
  for (const w of String(text).toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || []) {
    if (STOP.has(w) || w.length < 4) continue;
    v[w] = (v[w] || 0) + 1;
  }
  return v;
}
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
  for (const k in b) nb += b[k] * b[k];
  return na > 0 && nb > 0 ? round6(dot / (Math.sqrt(na) * Math.sqrt(nb))) : 0;
}
export const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 0);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// organs: [{ domain, field, family, book }]. Returns { nodes, edges:[{a,b,w,same,kin,sim}] } — a symmetric weighted graph.
// same-field links strongest; same-family (related fields) links moderately; shared pattern-book structure adds on top.
export function buildSynapses(organs, { wField = 0.45, wFamily = 0.22, wSim = 0.4 } = {}) {
  const vecs = organs.map((o) => termVector(o.book || ''));
  const edges = [];
  for (let i = 0; i < organs.length; i++) for (let j = i + 1; j < organs.length; j++) {
    const same = organs[i].field && organs[i].field === organs[j].field ? 1 : 0;
    const kin = !same && organs[i].family && organs[i].family === organs[j].family ? 1 : 0;
    const sim = cosine(vecs[i], vecs[j]);
    const w = round6(clamp01(wField * same + wFamily * kin + wSim * sim));
    edges.push({ a: organs[i].domain, b: organs[j].domain, w, same, kin, sim });
  }
  return { nodes: organs.map((o) => ({ domain: o.domain, field: o.field, family: o.family })), edges };
}

// HEBBIAN: a build receipt that names two organs nudges their link. success -> strengthen, failure -> weaken. Total.
export function hebbianUpdate(graph, { a, b, success, rate = 0.15 } = {}) {
  if (!graph || !Array.isArray(graph.edges) || !a || !b) return graph;
  const e = graph.edges.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (e) e.w = round6(clamp01(e.w + (success ? rate : -rate)));
  else if (a !== b) graph.edges.push({ a, b, w: round6(clamp01(success ? rate : 0)), same: 0, sim: 0 });
  return graph;
}

// THE DREAM-GATE: cut links below the floor; keep only synapses that earned their place.
export function prune(graph, floor = 0.15) {
  if (!graph || !Array.isArray(graph.edges)) return graph;
  return { nodes: graph.nodes, edges: graph.edges.filter((e) => e.w >= floor).sort((x, y) => y.w - x.w) };
}

export default { termVector, cosine, buildSynapses, hebbianUpdate, prune };
