# The Konomi SLM

**▶ Live: https://sjgant80-hub.github.io/konomi-slm/** — grow the library and ask it in your browser; nothing is sent anywhere.

A small-model architecture that keeps its knowledge in a **verified, readable pattern-library** instead of opaque weights. It answers from a pattern that predicted held-out cases it never saw, or it **abstains** — it does not hallucinate.

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

## Honest scope

v1 proves the **architecture** on structured-prediction domains, where "predict held-out or die" is measurable. The verified patterns are interpretable scorecards, not free-form text generation. The small model's job (free text → which domain) is optional and kept out of everything graded. The defensible claim is *"beats a flat model on any domain it has a verified pattern for, and refuses instead of guessing on anything it doesn't"* — not "beats GPT at everything." Breadth grows as the library grows.

## Credit

Powered by the Konomi architecture, created by **Thomas Frumkin**. The grow→grade-on-held-out ribosome, the SENTINEL guard and the SHA-256 are vendored verbatim from the seed-library / fall-spore lineage (`./vendor`). Real data: UCI Online Shoppers (Sakar & Kastro, 2018, CC BY 4.0). MIT licensed.
