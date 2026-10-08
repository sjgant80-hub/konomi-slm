## Own a brain from your CSVs

**NEW — queue #11, THE PRODUCT:** `node tools/your-brain.mjs data` turns a folder of YOUR CSVs into a booted, verified mind you own — organs kept only if they predict held-out rows (demo: AUC 0.870 on 4,931 unseen), no-signal files refused with the reason. **Live: https://sjgant80-hub.github.io/konomi-slm/brain.html**

# The Konomi SLM

**▶ Live: https://sjgant80-hub.github.io/konomi-slm/** — grow the library and ask it in your browser; nothing is sent anywhere.

**A neurosymbolic verified knowledge engine with abstention.** A model *proposes*, but only rules that predict unseen data are kept, so it proves what it says and abstains when it can't. Knowledge lives in a **verified, readable, compressed pattern-library** instead of opaque weights, and it grows by adding verified rules — not by retraining.

> **It is not an LLM — that's the point.** Calling it an SLM invites "is your model big enough?" (the wrong axis). It belongs to real, serious directions: **neurosymbolic AI** (neural proposer + symbolic verified rules), **selective prediction** (it abstains), **evolutionary program search** (the FunSearch / AlphaEvolve family — propose, test on held-out, keep only winners), and **compression-as-intelligence / MDL** (the shortest model that predicts the data). It fuses all four into one owned, CPU-scale, multi-domain, self-growing system. We don't compete on model size; we stand on *verified*.

## The inversion

Every other small model shrinks a big one (quantize/distil) until accuracy falls off a cliff. The model *is* the knowledge, so compressing the model loses the knowledge. The Konomi SLM inverts that:

- **Knowledge lives in a pattern-library** — each pattern must predict held-out cases or it is **cut** (the gate). The library is stored as tiny Konomi *seeds* (a few hundred bytes), not weights.
- **A tiny model only routes.** Shrinking it loses nothing, because the knowledge is in the library.
- **The gate guarantees fidelity.** Out-of-distribution input is abstained, not guessed. Every answer carries a tamper-evident receipt naming the pattern that earned it and its held-out score.

## Measured (this repo, reproducible with `npm run`)

| | |
|---|---|
| patterns verified into the library | **4 / 4** (held-out AUC ≥ 0.60 or cut) |
| whole library | **170 bytes of seeds** → 3491 bytes grown = **20.5× lossless** |
| held-out AUC | shopper **0.675** (REAL UCI data) · triage 0.884 · water 0.767 · crop 0.769 |
| abstains on out-of-distribution junk | **100%** |
| mixed answerable+unanswerable stream | Konomi SLM **86.0%** vs a flat always-guess baseline **52.7%** |

The edge is the **abstain**: it refuses what it cannot verify instead of hallucinating. On a commonsense domain (triage) a general 1B model ties it; the Konomi SLM's advantage is on abstract domains (verified ranking) and on refusing the unanswerable.

```
npm run         # build the library and print the measured report
npm test        # the unit tests (the gate's teeth)
npm run witness # the mutation gate — mutate the kernel, the tests must catch every change
npm run duel    # optional, ungraded: verified pattern vs llama3.2:1b (needs local Ollama)
```

## The ladder — tier 1 builds tier 2

Scaling here is **library-growth, not weight-training**. `node tools/run-tier.mjs` grows tier 2 from tier 1: tier 1's champion patterns warm-start tier 2's search, every existing domain is kept only if it holds-or-beats tier 1 (**monotone — never worse**), and new verticals broaden it. Measured rung:

```
TIER 1:  4 domains · mean held-out AUC 0.774 · 170 bytes of seeds
TIER 2:  7 domains · mean held-out AUC 0.786 · 405 bytes of seeds
TIER 3: 11 domains · mean held-out AUC 0.787 · 650 bytes of seeds
  rung 1→2  shopper (REAL) 0.675→0.781 ▲ · water/crop ▲ · triage held · + fraud/maintenance/credit
  rung 2→3  shopper 0.781→0.783 ▲ · fraud 0.749→0.765 ▲ · maintenance 0.809→0.834 ▲ · + churn/energy/intrusion/inventory
  every rung monotone — no domain ever regresses · library stays a few hundred bytes
```

That is the whole scaling story: 1B→2B→…→70B is the **library compounding** — more verified domains (breadth = polymath), deeper patterns (depth), each rung provably dominating the last with a tier-over-tier receipt — CPU-only, because you grow libraries, not weights. A frontier/local model can *propose* a new domain (imagination); only what the gate verifies on held-out enters, so it stays owned, never a fork.

## The neural proposer — completing the neurosymbolic loop

`tools/propose-local.mjs` wires a local model (sovereign — your own Ollama) as the *neural* half: it reads a domain and proposes which features predict the positive class and in which direction; those hypotheses warm-start the growth engine, and the gate **selects the best candidate by validation** (the neutral-stem baseline always in the pool), then reports on the untouched held-out test. Nothing the model says is trusted until the gate keeps it.

Measured (`node tools/run-propose.mjs`, UNGRADED / local / non-deterministic):
- A **1B** model proposed the fraud directions *backwards* (raw held-out 0.39) — **the gate caught it, no harm** (selected 0.730 vs stem 0.733). A wrong prior can't poison the result.
- **qwen2.5:7b** proposed the correct two features (merchantRisk / cardNotPresent high); its raw 2-rule guess was the **single best classifier on held-out (0.754 vs random search's 0.733)** — genuine neural value as a readable prior. But validation is a noisy proxy on these small domains, so the gate's val-pick landed ~even with the baseline on test.

Honest finding: the neural layer produces real value, **the gate guarantees it can never poison the result**, and reliably *harnessing* weak priors on small domains wants a more robust (multi-fold) selector — noted, not faked. The loop is real now, not a stub: neural proposes, the gate decides.

## Honest scope

v1 proves the **architecture** on structured-prediction domains, where "predict held-out or die" is measurable. The verified patterns are interpretable scorecards, not free-form text generation. The small model's job (free text → which domain) is optional and kept out of everything graded. The defensible claim is *"beats a flat model on any domain it has a verified pattern for, and refuses instead of guessing on anything it doesn't"* — not "beats GPT at everything." Breadth grows as the library grows.

## Credit

Powered by the Konomi architecture, created by **Thomas Frumkin**. The grow→grade-on-held-out ribosome, the SENTINEL guard and the SHA-256 are vendored verbatim from the seed-library / fall-spore lineage (`./vendor`). Real data: UCI Online Shoppers (Sakar & Kastro, 2018, CC BY 4.0). MIT licensed.
