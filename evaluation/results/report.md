# Pokédex benchmark report

Benchmark executed: 2026-11-04T05:55:37.677518+00:00

## Image classification evaluation

- Dataset: WTP-Bench (official artwork, Gen 1–8).
- Samples attempted: **905**, successful: **905**, failed: **0**.
- Top-1 accuracy (successful requests): **97.7%** (884/905).
- End-to-end correct responses (failures counted as incorrect): **97.7%** (884/905).
- Indicative Wilson 95% interval (Top-1, conditional): **96.5%–98.5%**; valid only under simplified binomial assumptions.
- Top-5 accuracy: **not available** (API did not return five usable candidates).
- End-to-end latency p50/p95: **1750 ms / 3429 ms** (successes only; includes network and retries in API mode).

### Accuracy by generation

| Generation | Top-1 | Correct / successful | Failed |
|---|---:|---:|---:|
| 1 | 98.0% | 148/151 | 0 |
| 2 | 95.0% | 95/100 | 0 |
| 3 | 97.0% | 131/135 | 0 |
| 4 | 96.3% | 103/107 | 0 |
| 5 | 98.1% | 153/156 | 0 |
| 6 | 100.0% | 72/72 | 0 |
| 7 | 100.0% | 88/88 | 0 |
| 8 | 97.9% | 94/96 | 0 |

![Top-1 accuracy by generation](accuracy_by_generation.svg)

### Scope and limitations

This is a **reference benchmark**, not a verified held-out test. Official artwork might overlap the training images of the pre-existing ViT model. WTP-Bench covers Generations 1–8 only, not all 1,025 classes. The benchmark measures species identification; alternative forms are not separately scored. Each species has one curated image, so results do not measure variation across images or real-world accuracy. Top-5 is reported only where the API supplies five candidates; model scores are not necessarily calibrated probabilities. The service did not expose its exact model revision. The Wilson interval uses a simplified binomial assumption and does not account for image-source or training overlap.

Reproducibility: [dataset source](https://github.com/eternal-f1ame/WTP-Bench), [evaluation code](../benchmark/), [predictions](predictions.csv), [metrics](metrics.json).

## Most frequent mistakes or request errors

| Expected | Predicted | Count |
|---|---|---:|
| arcanine | Growlithe | 1 |
| tentacruel | Tentacool | 1 |
| cubone | Marowak | 1 |
| crobat | Zubat | 1 |
| lanturn | Chinchou | 1 |
| teddiursa | Ursaring | 1 |
| magcargo | Slugma | 1 |
| hitmontop | Tyrogue | 1 |
| poochyena | Mightyena | 1 |
| azurill | Marill | 1 |
| medicham | Meditite | 1 |
| claydol | Baltoy | 1 |
| luxio | Luxray | 1 |
| happiny | Chansey | 1 |
| tangrowth | Tangela | 1 |
| porygon-z | Porygon | 1 |
| zebstrika | Blitzle | 1 |
| gigalith | Roggenrola | 1 |
| krokorok | Sandile | 1 |
| orbeetle | Dottler | 1 |

## Notes

The numeric score returned by softmax is not a calibrated probability of being correct.
An API request failure is counted in end-to-end correct rate but excluded from model-only Top-1 accuracy.
This report was generated from predictions.csv; no manual scores were supplied.
