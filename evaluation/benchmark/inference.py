"""Real classification inference via the deployed API or locally loaded HF ViT."""
from __future__ import annotations

import json
import mimetypes
import os
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from .common import (DATA_DIR, RESULTS_DIR, MODEL_ID, PREDICTION_FIELDS, make_label_to_id,
                     normalize_name, read_csv, resolved_local_path, sha256, write_csv, write_json)

DEFAULT_URL = 'https://cosmicsheep42-backend.hf.space/classify'
RETRYABLE_HTTP = {429, 500, 502, 503, 504}


def _extract_candidate(entry: Any) -> dict | None:
    if isinstance(entry, str):
        label, score = entry, None
    elif isinstance(entry, dict):
        label = next((entry[key] for key in ('pokemonName', 'pokemon_name', 'label', 'name', 'pokemon')
                      if isinstance(entry.get(key), str) and entry[key].strip()), None)
        score = next((entry[key] for key in ('modelScore', 'score', 'probability', 'confidence')
                      if isinstance(entry.get(key), (int, float)) and not isinstance(entry.get(key), bool)), None)
    else:
        return None
    if not label:
        return None
    return {'name': str(label), 'model_score': float(score) if score is not None else None}


def parse_prediction(payload: object) -> tuple[str, list[dict], float | None, bool]:
    """Parse existing API contract. Do not invent top-5 when API sends only top-1."""
    if not isinstance(payload, dict):
        raise ValueError('Expected a JSON object from classification service')
    top1 = payload.get('pokemonName')
    if not isinstance(top1, str) or not top1.strip():
        raise ValueError('Missing non-empty pokemonName in response')
    candidates_raw = payload.get('candidates')
    if candidates_raw is None:
        candidates_raw = payload.get('top5')
    if candidates_raw is not None and not isinstance(candidates_raw, list):
        raise ValueError('candidates must be an array when present')
    candidates = []
    seen = set()
    if isinstance(candidates_raw, list):
        for raw in candidates_raw:
            candidate = _extract_candidate(raw)
            if candidate and normalize_name(candidate['name']) not in seen:
                candidates.append(candidate)
                seen.add(normalize_name(candidate['name']))
    model_score = next((entry['model_score'] for entry in candidates
                        if normalize_name(entry['name']) == normalize_name(top1)), None)
    if model_score is None and isinstance(payload.get('modelScore'), (int, float)):
        model_score = float(payload['modelScore'])
    return top1, candidates, model_score, isinstance(candidates_raw, list) and len(candidates) >= 5


class APIClient:
    def __init__(self, *, url: str, timeout: float, retries: int = 1) -> None:
        if not url.startswith(('https://', 'http://127.0.0.1:', 'http://localhost:')):
            raise ValueError('Use HTTPS for remote APIs, or HTTP only for localhost')
        self.url = url
        self.timeout = timeout
        self.retries = retries

    def classify(self, file_path: Path) -> tuple[dict, int]:
        body, content_type = self._multipart(file_path)
        request = urllib.request.Request(self.url, data=body,
                                         headers={'Content-Type': content_type,
                                                  'Accept': 'application/json',
                                                  'User-Agent': 'PokedexBenchmarkKit/1.0'}, method='POST')
        for attempt in range(1, self.retries + 2):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    payload = response.read(2 * 1024 * 1024 + 1)
                    if len(payload) > 2 * 1024 * 1024:
                        raise ValueError('Response is unexpectedly large')
                return json.loads(payload), attempt
            except urllib.error.HTTPError as error:
                short_body = error.read(300).decode('utf-8', errors='replace')
                if error.code not in RETRYABLE_HTTP or attempt >= self.retries + 1:
                    raise RuntimeError(f'HTTP {error.code}: {short_body}') from error
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                if attempt >= self.retries + 1:
                    raise RuntimeError(f'Request failed: {error}') from error
            if attempt <= self.retries:
                time.sleep(min(6, attempt * 1.5))
        raise RuntimeError('Retry limit exceeded')

    @staticmethod
    def _multipart(file_path: Path) -> tuple[bytes, str]:
        boundary = 'pokedex-' + uuid.uuid4().hex
        mime = mimetypes.guess_type(file_path.name)[0] or 'application/octet-stream'
        data = file_path.read_bytes()
        header = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
                  f'filename="{file_path.name}"\r\nContent-Type: {mime}\r\n\r\n').encode('utf-8')
        body = header + data + f'\r\n--{boundary}--\r\n'.encode('ascii')
        return body, f'multipart/form-data; boundary={boundary}'


class LocalModel:
    """Optional heavy dependency path; installs from requirements-local.txt only."""
    def __init__(self, model_id: str = MODEL_ID):
        try:
            import torch
            from PIL import Image
            from transformers import ViTImageProcessor, ViTForImageClassification
        except ImportError as exc:
            raise SystemExit('Local mode requires pip install -r requirements-local.txt') from exc
        self.torch, self.Image = torch, Image
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.device = device
        self.processor = ViTImageProcessor.from_pretrained(model_id)
        self.model = ViTForImageClassification.from_pretrained(model_id).to(device).eval()

    def classify(self, file_path: Path) -> tuple[dict, int]:
        with self.Image.open(file_path) as img:
            inputs = self.processor(images=img.convert('RGB'), return_tensors='pt').to(self.device)
        with self.torch.inference_mode():
            logits = self.model(**inputs).logits[0]
            probabilities = self.torch.softmax(logits, dim=-1)
            scores, indices = self.torch.topk(probabilities, k=min(5, len(probabilities)))
        candidates = [{'pokemonName': self.model.config.id2label[int(idx)], 'modelScore': float(score)}
                      for score, idx in zip(scores.detach().cpu().tolist(), indices.detach().cpu().tolist())]
        return {'pokemonName': candidates[0]['pokemonName'], 'candidates': candidates}, 1


def choose_prediction_id(name: str, alias_to_id: dict[str, int]) -> str:
    normalized = normalize_name(name)
    if not normalized:
        return ''
    if normalized in alias_to_id:
        return str(alias_to_id[normalized])
    return ''


def evaluate_sample(sample: dict[str, str], payload: dict, aliases: dict[str, int]) -> dict:
    name, candidates, score, top5_available = parse_prediction(payload)
    expected_id = str(sample.get('expected_id') or '').strip()
    expected_label = normalize_name(sample.get('expected_name'))
    actual_id = choose_prediction_id(name, aliases)

    def matches(predicted: str) -> bool:
        pred_id = choose_prediction_id(predicted, aliases)
        if expected_id and pred_id:
            return expected_id == pred_id
        return normalize_name(predicted) == expected_label

    top1 = matches(name)
    top5_correct = any(matches(c['name']) for c in candidates[:5]) if top5_available else None
    return {'status': 'ok', 'predicted_name': name, 'predicted_id': actual_id,
            'top1_correct': int(top1), 'top5_correct': '' if top5_correct is None else int(top5_correct),
            'top5_available': int(top5_available), 'model_score': '' if score is None else score,
            'error': '', 'candidates_json': json.dumps(candidates[:5], ensure_ascii=False)}


def run(args) -> None:
    dataset_dir = Path(args.dataset_dir).expanduser().resolve()
    result_dir = Path(args.output_dir).expanduser().resolve()
    manifest_path = dataset_dir / 'manifest.csv'
    if not manifest_path.exists():
        raise SystemExit(f'Missing {manifest_path}. Run prepare or import-local first.')
    samples = read_csv(manifest_path)
    if not samples:
        raise SystemExit('Manifest is empty')
    if args.max_samples is not None:
        samples = samples[:args.max_samples]
    metadata_path = dataset_dir / 'source_metadata.csv'
    aliases = make_label_to_id(read_csv(metadata_path)) if metadata_path.exists() else {}
    for s in samples:
        expected_id = s.get('expected_id', '')
        if expected_id:
            aliases[normalize_name(s['expected_name'])] = int(expected_id)
        else:
            aliases.setdefault(normalize_name(s['expected_name']), -1)
    service = (APIClient(url=args.url, timeout=args.timeout, retries=args.retries)
               if args.backend == 'api' else LocalModel(model_id=args.model))
    warmup_result = None
    if args.warmup:
        path = resolved_local_path(dataset_dir, samples[0]['image_path'])
        if path.is_file():
            start = time.perf_counter()
            try:
                _, attempts = service.classify(path)
                warmup_result = {'status': 'ok', 'latency_ms': round((time.perf_counter()-start)*1000, 2), 'attempts': attempts}
            except Exception as exc:
                warmup_result = {'status': 'failed', 'error': str(exc)}
            print(f'Warm-up: {warmup_result}')
    results = []
    result_dir.mkdir(parents=True, exist_ok=True)
    for index, sample in enumerate(samples, 1):
        row = dict(sample)
        row.update({'status': 'failed', 'predicted_name': '', 'predicted_id': '',
                    'top1_correct': '', 'top5_correct': '', 'top5_available': 0,
                    'model_score': '', 'latency_ms': '', 'attempts': 0,
                    'error': '', 'candidates_json': '[]'})
        try:
            image = resolved_local_path(dataset_dir, sample['image_path'])
            if not image.is_file():
                raise FileNotFoundError(f'Missing image: {sample["image_path"]}')
            expected_hash = sample.get('sha256') or ''
            if expected_hash and sha256(image.read_bytes()) != expected_hash:
                raise ValueError(f'Image SHA256 mismatch: {sample["image_path"]}')
            start = time.perf_counter()
            try:
                payload, attempts = service.classify(image)
            finally:
                row['latency_ms'] = round((time.perf_counter()-start)*1000, 2)
            row['attempts'] = attempts
            row.update(evaluate_sample(sample, payload, aliases))
        except Exception as exc:
            row['error'] = str(exc)[:400]
        results.append(row)
        state = '✓' if row['top1_correct'] == 1 else ('✗' if row['status'] == 'ok' else '!')
        print(f'[{index}/{len(samples)}] {state} {sample["expected_name"]}: {row["predicted_name"] or row["error"]}')
        # Crash-safe partial output after every sample; no fabricated results.
        write_csv(result_dir / 'predictions.csv', results, PREDICTION_FIELDS)
        if args.delay and index < len(samples):
            time.sleep(args.delay)
    write_json(result_dir / 'run_metadata.json', {
        'backend': args.backend, 'model': args.model if args.backend == 'local' else 'remote-service-defined',
        'url': args.url if args.backend == 'api' else None,
        'source_manifest': os.path.relpath(manifest_path, Path(__file__).resolve().parent.parent),
        'attempted': len(samples),
        'warmup': warmup_result, 'timestamp_utc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'latency_definition': 'End-to-end client request latency including network/retries for API; forward pass and preprocessing for local mode.',
        'unverified_training_overlap': True,
    })
    print(f'Results saved: {result_dir / "predictions.csv"}. Generate report with: python -m benchmark report')
