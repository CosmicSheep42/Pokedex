# Evaluation methodology

## Unit of analysis

Each `manifest.csv` row describes one image, its source, expected base species, National Pokédex ID, generation, and condition. The file must exist and, when a `sha256` value is present, match that hash. The default WTP-Bench sample deterministically selects 12 base-form images per generation (1–8), using seed 42, so species with many alternate forms do not dominate the sample.

This is not a test split verified against the ViT training data. Treat it as a reference benchmark. A stronger generalization test would use manually reviewed photographs or artwork from other sources, with a defensible separation from training data.

## Protocol

1. Images come from a pinned WTP-Bench revision or from user-supplied folders with verified labels.
2. The downloader writes a manifest with paths and SHA-256 hashes to record exactly which images were used.
3. The first request may wake the hosted service. It is excluded from sample latency and recorded separately.
4. For every sample, inference records the predicted name, normalized ID when available, actual API candidates, optional score, status, error, retries, and latency.
5. Predictions are compared by base species rather than form, using name normalization and aliases derived from the dataset metadata.
6. Missing responses are never replaced with guesses. Top-5 is N/A when the server does not provide five valid candidates.
7. `report` reads `predictions.csv` and generates metrics and report files.

## Denominators and safeguards

- `successful`: valid, decoded API responses containing `pokemonName`.
- `failed`: API exceptions, missing files, invalid responses, or timeouts.
- **Conditional Top-1** = `top1_correct / successful` (N/A if `successful=0`).
- **Conditional Top-5** = `top5_correct / responses_with_5_candidates` (N/A if there are none). If Top-5 availability is not random, this conditional metric may be biased.
- **End-to-end accuracy** = `top1_correct / planned`; failures count as misses and are distinguished from classifier accuracy.
- **Failure rate** = `failed / planned`.
- **Latency p50/p95** = interpolated percentiles over successful requests, measured client-side. API latency includes transport, network, and retries, not only model execution.
- **95% Wilson interval** = an approximate binomial interval for Top-1 when there are enough observations. It does not account for sampling uncertainty, class variation, or correlated images; interpret it cautiously.

## Generations and robustness

`per_generation.csv` shows differences across Generations 1–8, but small per-generation samples provide only preliminary evidence. `per_variation.csv` separates official art, silhouettes, and synthetic transformations. Comparisons with transformed versions are descriptive; paired evaluations should account for dependence between each source image and its variants.

## Scores

`modelScore` is generally derived from ViT softmax logits. It is **not a calibrated probability of correctness**; a value such as `0.98` does not mean there is a 98% chance the prediction is right. Calibration claims require a separate calibration dataset and analyses such as ECE, Brier score, and a reliability diagram.

## Coverage

The classifier claims to cover 1,025 species. WTP-Bench only reaches National Pokédex ID 905, so even `--all-base` does not measure Generation 9. Do not compare these results directly with multimodal VLM leaderboards: their protocols, scope, and architectures differ.

## Metrics that must not be published

- Production accuracy without labeled production images.
- A percentage taken from mock-based tests.
- An artificially reconstructed Top-5 when the backend returns only Top-1.
- “Accuracy on 1,025 species” based on 96 or 905 images.
- “Fully independent test set” without evidence about image provenance and training data.
