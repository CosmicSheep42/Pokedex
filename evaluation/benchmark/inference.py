"""Real classification inference via the deployed API or locally loaded HF ViT."""
from __future__ import annotations

import json
import mimetypes
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


def observe_model_identity(metadata: dict, payload: object) -> None:
    """Track API-reported identity without treating missing metadata as verification."""
    identity = metadata.setdefault('model_identity', {
        'status': 'unverified', 'responses': 0, 'responses_with_model_metadata': 0,
        'responses_with_revision': 0, 'responses_missing_revision': 0,
        'model_ids': [], 'revisions': [],
    })
    identity['responses'] += 1
    model = payload.get('model') if isinstance(payload, dict) else None
    if not isinstance(model, dict):
        identity['responses_missing_revision'] += 1
    else:
        model_id = model.get('id')
        revision = model.get('revision')
        if isinstance(model_id, str) and model_id.strip():
            identity['responses_with_model_metadata'] += 1
            if model_id not in identity['model_ids']:
                identity['model_ids'].append(model_id)
        if isinstance(revision, str) and revision.strip():
            identity['responses_with_revision'] += 1
            if revision not in identity['revisions']:
                identity['revisions'].append(revision)
            metadata['model_revision'] = metadata.get('model_revision') or revision
        else:
            identity['responses_missing_revision'] += 1
        if isinstance(model_id, str) and model_id.strip():
            metadata['backend_model'] = metadata.get('backend_model') or model_id

    if len(identity['revisions']) > 1 or len(identity['model_ids']) > 1:
        identity['status'] = 'inconsistent'
    elif not identity['responses_with_revision']:
        identity['status'] = 'unverified'
    elif (identity['responses_missing_revision'] or
          identity['responses_with_model_metadata'] != identity['responses']):
        identity['status'] = 'incomplete'
    else:
        identity['status'] = 'consistent'


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
        self.revision = getattr(self.model.config, '_commit_hash', None)

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
    info_path = dataset_dir / 'dataset_info.json'
    if not info_path.is_file():
        raise SystemExit(f'Missing {info_path}. Dataset identity is required for reproducible runs.')
    dataset_info = json.loads(info_path.read_text(encoding='utf-8'))
    samples = read_csv(manifest_path)
    if not samples:
        raise SystemExit('Manifest is empty')
    if args.max_samples is not None:
        samples = samples[:args.max_samples]
    if not samples:
        raise SystemExit('No samples selected')
    metadata_path = dataset_dir / 'source_metadata.csv'
    aliases = make_label_to_id(read_csv(metadata_path)) if metadata_path.exists() else {}
    for s in samples:
        expected_id = s.get('expected_id', '')
        if expected_id:
            aliases[normalize_name(s['expected_name'])] = int(expected_id)
        else:
            aliases.setdefault(normalize_name(s['expected_name']), -1)
    warmup_result = None
    result_dir.mkdir(parents=True, exist_ok=True)
    predictions_path = result_dir / 'predictions.csv'
    metadata_path = result_dir / 'run_metadata.json'
    if any(result_dir.iterdir()):
        raise SystemExit(f'{result_dir} already contains a run; choose a new --output-dir to avoid mixing executions')
    manifest_hash = sha256(manifest_path.read_bytes())
    dataset_files = {'manifest.csv': manifest_hash}
    for name in ('dataset_info.json', 'source_metadata.csv'):
        path = dataset_dir / name
        if path.exists():
            dataset_files[name] = sha256(path.read_bytes())
    run_id = uuid.uuid4().hex
    expected_ids = [sample.get('sample_id', '') for sample in samples]
    metadata = {
        'run_id': run_id, 'status': 'running', 'scope': 'partial' if args.max_samples is not None else 'complete',
        'backend': args.backend, 'endpoint': args.url if args.backend == 'api' else None,
        'model_id': args.model if args.backend == 'local' else None, 'model_revision': None,
        'backend_model': None, 'timeout_seconds': args.timeout, 'retries': args.retries,
        'model_identity': {'status': 'unverified', 'responses': 0,
                           'responses_with_model_metadata': 0, 'responses_with_revision': 0,
                           'responses_missing_revision': 0, 'model_ids': [], 'revisions': []},
        'delay_seconds': args.delay, 'warmup_enabled': bool(args.warmup),
        'manifest_sha256': manifest_hash, 'dataset_files_sha256': dataset_files,
        'dataset': {'source': dataset_info.get('source'), 'revision': dataset_info.get('revision'),
                    'mode': dataset_info.get('mode'), 'selection_seed': dataset_info.get('selection_seed'),
                    'include_forms': dataset_info.get('include_forms')},
        'dataset_sample_count': len(read_csv(manifest_path)), 'planned_sample_count': len(samples),
        'planned_sample_ids': expected_ids, 'max_samples': args.max_samples,
        'attempted': 0, 'predictions_sha256': None, 'source_manifest': str(manifest_path),
        'warmup': warmup_result,
        'timestamp_started_utc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'unverified_training_overlap': True,
    }
    results = []
    write_json(metadata_path, metadata)
    try:
        service = (APIClient(url=args.url, timeout=args.timeout, retries=args.retries)
                   if args.backend == 'api' else LocalModel(model_id=args.model))
        if args.backend == 'local':
            metadata['model_revision'] = service.revision
            metadata['model_identity'] = {
                'status': 'consistent' if service.revision else 'unverified',
                'source': 'loaded local model config', 'responses': 0,
                'responses_with_model_metadata': 0,
                'responses_with_revision': int(bool(service.revision)),
                'responses_missing_revision': 0 if service.revision else 1,
                'model_ids': [args.model], 'revisions': [service.revision] if service.revision else [],
            }
            write_json(metadata_path, metadata)
        if args.warmup:
            path = resolved_local_path(dataset_dir, samples[0]['image_path'])
            if path.is_file():
                start = time.perf_counter()
                try:
                    warmup_payload, attempts = service.classify(path)
                    warmup_result = {'status': 'ok', 'latency_ms': round((time.perf_counter()-start)*1000, 2), 'attempts': attempts}
                    if args.backend == 'api':
                        observe_model_identity(metadata, warmup_payload)
                except Exception as exc:
                    warmup_result = {'status': 'failed', 'error': str(exc)}
                metadata['warmup'] = warmup_result
                write_json(metadata_path, metadata)
                print(f'Warm-up: {warmup_result}')
        for index, sample in enumerate(samples, 1):
            row = dict(sample)
            row.update({'status': 'failed', 'predicted_name': '', 'predicted_id': '',
                        'top1_correct': '', 'top5_correct': '', 'top5_available': 0,
                        'model_score': '', 'latency_ms': '', 'attempts': 0,
                        'error': '', 'failure_stage': '', 'candidates_json': '[]'})
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
                if args.backend == 'api':
                    observe_model_identity(metadata, payload)
                row.update(evaluate_sample(sample, payload, aliases))
                row['failure_stage'] = ''
            except Exception as exc:
                row['error'] = str(exc)[:400]
                row['failure_stage'] = 'request' if isinstance(exc, RuntimeError) else 'response_or_input'
            results.append(row)
            state = '✓' if row['top1_correct'] == 1 else ('✗' if row['status'] == 'ok' else '!')
            print(f'[{index}/{len(samples)}] {state} {sample["expected_name"]}: {row["predicted_name"] or row["error"]}')
            # Crash-safe partial output after every sample; no fabricated results.
            write_csv(predictions_path, results, PREDICTION_FIELDS)
            metadata['attempted'] = len(results)
            metadata['predictions_sha256'] = sha256(predictions_path.read_bytes())
            write_json(metadata_path, metadata)
            if args.delay and index < len(samples):
                time.sleep(args.delay)
        identity_inconsistent = metadata['model_identity']['status'] == 'inconsistent'
        metadata['status'] = 'model_identity_inconsistent' if identity_inconsistent else 'completed'
        timestamp_key = 'timestamp_model_identity_inconsistent' if identity_inconsistent else 'timestamp_completed_utc'
        metadata[timestamp_key] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
        metadata['latency_definition'] = 'End-to-end client request latency including network/retries for API; forward pass and preprocessing for local mode.'
        write_json(metadata_path, metadata)
        if identity_inconsistent:
            raise RuntimeError('Model identity changed during this run; results cannot be reported as one consistent benchmark.')
    except BaseException:
        if metadata.get('status') != 'model_identity_inconsistent':
            metadata['status'] = 'interrupted'
            metadata['timestamp_interrupted_utc'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
            write_json(metadata_path, metadata)
        raise
    print(f'Results saved: {predictions_path}. Generate report with: python -m benchmark report --dataset-dir {dataset_dir} --output-dir {result_dir}')
