// tools/sleep.mjs — SLEEP (queue #7). The nightly fold-cycle: cluster the day's memories, compress each cluster into
// one consolidated "dream", and KEEP THE DREAM ONLY IF RECALL SURVIVES the compression. A dream that loses recall is
// not a memory, it's forgetting — so the gate refuses it and the raw memories stay. Pure, total, deterministic.
//
// The gate (the honest core): a candidate consolidation replaces its cluster's raw records with one compressed record
// built from the cluster's most-frequent terms (dropping the rare tail). We then re-run a set of recall queries — the
// terms you would use to find each memory — against the journal. The fold is accepted ONLY if recall does not drop AND
// the journal gets smaller. Redundant clusters (shared, frequent terms) compress hugely at no recall cost and are kept;
// diverse clusters would lose recall on their rare terms, so they are refused and left raw. That is the whole point:
// sleep compresses what is safe to compress and never forgets to save space.
// Reuses the synapse term model. Powered by the Konomi architecture, created by Thomas Frumkin.
import { termVector, cosine, round6 } from './synapses.mjs';

const bytesOf = (recs) => recs.reduce((n, r) => n + (r.text || '').length, 0);

// single-linkage clustering by term-cosine >= threshold
export function cluster(records, threshold = 0.3) {
  const vecs = records.map((r) => termVector(r.text || ''));
  const parent = records.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) if (cosine(vecs[i], vecs[j]) >= threshold) union(i, j);
  const groups = {};
  records.forEach((r, i) => { const k = find(i); (groups[k] = groups[k] || []).push(r); });
  return Object.values(groups);
}

// compress a cluster into one dream: keep terms SHARED across members (drop the unique tail), note its sources.
// shared terms are the redundancy worth keeping; unique terms are what a fold would lose, so the gate judges them.
export function consolidate(clusterRecords, minShare = 0.5) {
  const members = {};
  for (const r of clusterRecords) { for (const t of new Set(Object.keys(termVector(r.text || '')))) members[t] = (members[t] || 0) + 1; }
  const need = Math.max(2, Math.ceil(clusterRecords.length * minShare));
  const keep = Object.keys(members).filter((t) => members[t] >= need).sort();
  const ids = clusterRecords.map((r) => r.id);
  return { id: 'dream:' + ids.join('+'), text: keep.join(' ') + ' [consolidated from ' + ids.join(', ') + ']', dream: true, from: ids };
}

// recall: fraction of queries whose term is found in some record's text
export function recall(records, queries) {
  if (!queries.length) return 1;
  const hay = records.map((r) => (r.text || '').toLowerCase());
  let hit = 0;
  for (const q of queries) if (hay.some((t) => t.includes(q))) hit++;
  return round6(hit / queries.length);
}

// queries = each record's top-N distinctive terms (what you'd use to recall it)
export function queriesFor(records, perRecord = 3) {
  const out = new Set();
  for (const r of records) {
    const v = termVector(r.text || '');
    for (const t of Object.keys(v).sort((a, b) => v[b] - v[a]).slice(0, perRecord)) out.add(t);
  }
  return [...out];
}

// THE FOLD-CYCLE. records in -> a consolidated journal + a receipt. A dream is kept only if recall holds and bytes drop.
export function sleepFold(records, { threshold = 0.3, minShare = 0.5, queries = null } = {}) {
  const Q = queries || queriesFor(records);
  const baseRecall = recall(records, Q);
  const clusters = cluster(records, threshold);
  let journal = [];
  const kept = [], refused = [], singletons = [];
  for (const c of clusters) {
    if (c.length < 2) { journal.push(...c); singletons.push(...c.map((r) => r.id)); continue; }
    const dream = consolidate(c, minShare);
    const candidate = journal.concat([dream], records.filter((r) => !c.includes(r) && !journal.includes(r)));
    // measure recall of the WHOLE journal with this cluster folded vs raw
    const foldedJournal = records.map((r) => (c.includes(r) ? null : r)).filter(Boolean).concat([dream]);
    const rec = recall(foldedJournal, Q);
    const smaller = dream.text.length < bytesOf(c);
    if (rec >= baseRecall && smaller) { journal.push(dream); kept.push({ dream: dream.id, from: dream.from, bytes: [bytesOf(c), dream.text.length] }); }
    else { journal.push(...c); refused.push({ from: c.map((r) => r.id), why: rec < baseRecall ? `recall ${rec} < ${baseRecall}` : 'no size win' }); }
  }
  const recallAfter = recall(journal, Q);
  return {
    journal,
    receipt: {
      memoriesIn: records.length, memoriesOut: journal.length,
      bytesIn: bytesOf(records), bytesOut: bytesOf(journal),
      recallBefore: baseRecall, recallAfter, recallHeld: recallAfter >= baseRecall,
      dreamsKept: kept, dreamsRefused: refused, singletons, queries: Q.length,
    },
  };
}

export default { cluster, consolidate, recall, queriesFor, sleepFold };
