# KONOMI SLM · sealed claims · THE MULTIPLIER

Written and committed **before any code that runs or measures this test exists** in this repo. The code that measures
it (`tools/multiplier.mjs`, `tools/run-multiplier.mjs`, `tools/check-multiplier.mjs`) comes in a later commit. The
receipt it writes records this file's SHA-256, and CI fails if this file changes after the run. A claim that fails is
kept as failed and shown on the live page. No earlier claim or receipt in this repo is touched.

**The question.** On a domain the Konomi SLM covers, does its verified pattern book (four readable rules, grown from
training rows and kept only because they predicted months they never saw) rank unseen cases better than a much bigger
raw language model asked the same question about the same cases? And does handing a raw model that pattern book lift
it: can a 7.6-billion-parameter model with the book beat a raw 14.8-billion-parameter model?

**The domain.** `shopper`: the REAL UCI Online Shoppers Purchasing Intention data (Sakar & Kastro, 2018, DOI
10.24432/C5F88Q, CC BY 4.0), as loaded by `vendor/seed-library/domains.mjs` unchanged: 12,330 sessions, ten numeric
features, the label is purchase (Revenue). Patterns grow on February to October only; the held-out set is November and
December, 4,725 sessions (976 purchases). No pattern below has seen a held-out session.

The block below is the seal. The tools read it; the prose around it explains it.

```json
{
  "kind": "konomi-slm.claims",
  "test": "MULTIPLIER",
  "version": 1,
  "name": "THE MULTIPLIER (a verified pattern book vs bigger raw models, and a raw model levelled by the book)",
  "seenBeforeSeal": "Known before this seal: KF's held-out AUC on all 4,725 held-out sessions is 0.813532 (pattern-books/shopper.receipt.json, committed 2026-10-07); KF re-derives from its recorded hypotheses with no model and lands on that receipt's hash exactly; K3 is 0.782578 and K1 is 0.675387 on the same 4,725 (tools/run-tier.mjs). Before this seal, two timing calls were made to qwen2.5:7b with a made-up session that is not a row of the data (it answered 85 both times), only to size the run. No held-out session has been shown to any model for this test, and no arm's score on the sample below has been computed.",
  "domain": {
    "id": "shopper",
    "loader": "vendor/seed-library/domains.mjs loadShopper, unchanged",
    "data": "vendor/seed-library/data/online_shoppers_intention.csv",
    "features": ["Administrative", "Administrative_Duration", "Informational", "Informational_Duration", "ProductRelated", "ProductRelated_Duration", "BounceRates", "ExitRates", "PageValues", "SpecialDay"],
    "label": "1 = the session ends in a purchase (Revenue TRUE)",
    "heldOut": "November and December sessions (4,725), in file order"
  },
  "sample": {
    "rule": "From the held-out rows in file order, P = the purchase rows and N = the no-purchase rows. Take P[floor(k * |P| / 100)] for k = 0..99 and N[floor(k * |N| / 100)] for k = 0..99. 200 sessions, 100 of each class. No random draw.",
    "why": "AUC and balanced accuracy do not depend on the class mix; an even sample makes both tighter for the same number of model calls."
  },
  "arms": {
    "KF": "PRIMARY Konomi arm: the shipped shopper pattern book (pattern-books/shopper.book.txt), re-derived by tools/patternforge.mjs forgeOrgan from the hypotheses recorded in pattern-books/shopper.receipt.json with no model; the re-derivation must land on that receipt's receiptHash. Its score for a session is konomi-slm.mjs scoreInput(pattern, session). Its label is konomi-slm.mjs answer() over a library holding only this pattern; an ABSTAIN counts as a wrong label.",
    "K3": "descriptive, no bar: the tier-3 shopper pattern the ladder grows (buildLibrary(['shopper']) then growTier twice with no new domains), scored by scoreInput.",
    "K1": "descriptive, no bar: the tier-1 shopper pattern the live page's 'Grow the library' builds (buildLibrary), scored by scoreInput.",
    "R14": "qwen2.5:14b, raw: 14.8B parameters, Q4_K_M, Ollama digest 7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6, weights 8,988,124,069 bytes. Prompt P.",
    "R7": "qwen2.5:7b, raw: 7.6B parameters, Q4_K_M, Ollama digest 845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e, weights 4,683,087,332 bytes. Prompt P.",
    "B7": "qwen2.5:7b (the same digest) with the book: the text of pattern-books/shopper.mind-context.txt with surrounding whitespace trimmed, then a blank line, then prompt P."
  },
  "promptP": [
    "You are an e-commerce analyst. Below is one visit (session) to an online shop, from the UCI Online Shoppers Purchasing Intention data.",
    "Definitions: Administrative, Informational and ProductRelated are the number of pages of each type visited in the session, and each _Duration is the total seconds spent on them. BounceRates is the average bounce rate of the pages visited (the share of visitors who entered on that page and left without another request). ExitRates is the average exit rate of the pages visited (the share of that page's views that were the last in a session). PageValues is the average page value of the pages visited (the average value of a page that users visited before completing a purchase). SpecialDay is how close the visit is to a special day such as Mother's Day or Valentine's Day, from 0 to 1.",
    "Session:",
    "Administrative: {Administrative}",
    "Administrative_Duration: {Administrative_Duration}",
    "Informational: {Informational}",
    "Informational_Duration: {Informational_Duration}",
    "ProductRelated: {ProductRelated}",
    "ProductRelated_Duration: {ProductRelated_Duration}",
    "BounceRates: {BounceRates}",
    "ExitRates: {ExitRates}",
    "PageValues: {PageValues}",
    "SpecialDay: {SpecialDay}",
    "What is the probability, from 0 to 100, that this session ends in a purchase? Answer with ONLY an integer from 0 to 100."
  ],
  "promptJoin": "the lines above joined with a single newline",
  "valueFormat": "Administrative, Informational, ProductRelated: the whole number. Administrative_Duration, Informational_Duration, ProductRelated_Duration: one decimal place. BounceRates, ExitRates: four decimal places. PageValues: two decimal places. SpecialDay: one decimal place. (JavaScript toFixed.)",
  "call": "Ollama POST /api/generate on this machine, stream false, options { temperature: 0, seed: 7, num_predict: 8 }, a 120-second timeout; a call that errors or times out is retried up to two more times. Order: all 200 R14 calls, then all 200 R7, then all 200 B7, sessions in sample order.",
  "parse": "The first run of 1 to 3 digits in the reply. If it is an integer from 0 to 100 it is the arm's score for that session; anything else (no digits, above 100, or a call that failed three times) is UNPARSED: score 50 for AUC, and a wrong label for balanced accuracy. A model's label is 1 when its score is 50 or more.",
  "metrics": {
    "AUC": "vendor/seed-library/seedlib.mjs auc(): the same function the gate uses, ties counted half",
    "balancedAccuracy": "the mean of the recall on purchases and the recall on no-purchases",
    "interval": "paired, stratified bootstrap: 2,000 resamples; each draws 100 purchase sessions and then 100 no-purchase sessions from the sample with replacement, index = floor(r * 100) with r from mulberry32 seeded 20261105, one stream for all resamples; every claim is scored on the same resamples. The 95% interval of a difference is the sorted differences' element 50 (low) and element 1950 (high), counting from 0."
  },
  "claims": [
    { "id": "X1", "primary": true, "claim": "THE MULTIPLIER: the Konomi pattern book out-ranks the raw 14.8B model. AUC(KF) minus AUC(R14) on the 200 sessions is above 0, and the 95% interval's low end is above 0." },
    { "id": "X2", "claim": "the Konomi pattern book out-ranks the raw 7.6B model: AUC(KF) minus AUC(R7) above 0, low end above 0." },
    { "id": "X3", "claim": "the Konomi pattern book's own answers beat the raw 14.8B model's yes/no: balanced accuracy(KF, ABSTAIN counted wrong) minus balanced accuracy(R14) above 0, low end above 0." },
    { "id": "X4", "claim": "the book levels the mind: the 7.6B model with the book out-ranks itself without it. AUC(B7) minus AUC(R7) above 0, low end above 0." },
    { "id": "X5", "claim": "the literal multiplier: the 7.6B model with the book out-ranks the raw 14.8B model, a model about twice its size. AUC(B7) minus AUC(R14) above 0, low end above 0." },
    { "id": "X6", "claim": "the instrument read the models: each of R14, R7 and B7 has at least 190 of its 200 replies parsed." }
  ],
  "verdict": "Each claim holds or fails on its own, scored exactly as written. The multiplier is proven if and only if X1 holds. X2 to X6 are reported beside it whatever they show. K1 and K3 are reported with no bar. The size of each arm is reported as a fact, not a claim: KF's owned seed in bytes (from its receipt) beside each model's weights in bytes (above).",
  "receipt": "receipts/multiplier.json: this file's SHA-256, the seal commit, the sample's row indices, every arm's score per session, every model reply as received (trimmed), the attempt count per call, the parse result, the metrics, the intervals and each claim's verdict. tools/check-multiplier.mjs re-scores every claim from the recorded replies and the re-derived Konomi arms with no model, and CI fails if anything differs from the receipt or if this file's SHA-256 differs from the one recorded.",
  "rerun": "No run is repeated to change a result. If the run is cut off by an instrument fault (Ollama down, the machine stops), it resumes at the first session without a recorded reply, with the same settings, and the receipt says so. Any change to the prompt, the sample, the models, the settings or the bars is a new claim file sealed before it runs, and this one stays as it is.",
  "notProven": "The raw models were asked zero-shot and were never shown a training row; the pattern book was grown from the February to October rows. This measures knowledge kept in a verified library against knowledge in a model's weights, not Konomi against a model fine-tuned on the same rows. Another prompt could score differently; this prompt is the one sealed. A model's reply is not reproducible byte for byte, so the receipt keeps every reply and CI re-scores from those, never re-asks. One domain and one machine. Nothing here is a claim about any other domain, model or prompt."
}
```

## Why there are five claims and one is primary

X1 is the question Simon asked: does a few dozen bytes of verified pattern beat a raw model whose weights are over a
hundred million times its size, on unseen real cases, measured by ranking (AUC) so a lucky threshold cannot fake it. X2 asks the same against the
7.6B model. X3 asks it in yes/no terms, counting a refusal as a miss. X4 and X5 ask the other half of the idea: whether
the verified book, handed to a model as plain text, makes the smaller model better, and better than a model twice its
size. Each one holds or fails on its own, and the failures stay on the page.
