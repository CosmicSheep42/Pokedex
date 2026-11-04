"""Download a reproducible, labeled sample from WTP-Bench (the PNGs stay local)."""
from __future__ import annotations

import random
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path
from .common import (DATA_DIR, MANIFEST_FIELDS, WTP_BASE, WTP_COMMIT, WTP_REPO,
                     read_csv, resolved_local_path, sha256, write_csv, write_json)

USER_AGENT = 'PokedexEvaluationKit/1.0 (educational benchmark)'
METADATA_URL = WTP_BASE + 'data/metadata.csv'
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'


def download_bytes(url: str, *, max_bytes: int = 18 * 1024 * 1024, attempts: int = 3) -> bytes:
    if not url.startswith(WTP_BASE):
        raise ValueError('Downloader accepts only pinned WTP-Bench URLs')
    last_error: Exception | None = None
    for trial in range(attempts):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError(f'File exceeds {max_bytes} bytes: {url}')
            return data
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if trial < attempts - 1:
                time.sleep(1.0 * (trial + 1))
    raise RuntimeError(f'Unable to download {url}: {last_error}')


def get_wtp_rows(dataset_dir: Path, *, refresh: bool = False) -> list[dict[str, str]]:
    metadata_path = dataset_dir / 'source_metadata.csv'
    if not metadata_path.exists() or refresh:
        data = download_bytes(METADATA_URL, max_bytes=2_000_000)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_bytes(data)
    rows = read_csv(metadata_path)
    if not rows or not {'image_path', 'base_id', 'base_name', 'gen', 'form'}.issubset(rows[0]):
        raise ValueError('WTP-Bench metadata has an unexpected schema')
    return rows


def select_rows(source_rows: list[dict[str, str]], *, per_generation: int = 12,
                all_base: bool = False, include_forms: bool = False,
                seed: int = 42) -> list[dict[str, str]]:
    by_generation: dict[int, list[dict[str, str]]] = defaultdict(list)
    seen = set()
    for row in source_rows:
        if not include_forms and (row.get('form') or '').strip():
            continue
        if not row.get('image_path', '').startswith('data/images/hq/'):
            continue
        key = row.get('image_path')
        if key in seen:
            continue
        seen.add(key)
        try:
            gen = int(row['gen'])
        except (TypeError, ValueError):
            continue
        by_generation[gen].append(row)
    rng = random.Random(seed)
    picked = []
    for generation in sorted(by_generation):
        group = sorted(by_generation[generation], key=lambda x: x['image_path'])
        if all_base:
            chosen = group
        else:
            chosen = rng.sample(group, min(per_generation, len(group)))
        picked.extend(sorted(chosen, key=lambda x: x['image_path']))
    return picked


def build_manifest(source_rows: list[dict[str, str]], *, per_generation: int = 12,
                   all_base: bool = False, include_forms: bool = False,
                   image_mode: str = 'hq', seed: int = 42) -> list[dict[str, str]]:
    selected = select_rows(source_rows, per_generation=per_generation, all_base=all_base,
                           include_forms=include_forms, seed=seed)
    variations = ['hq', 'silhouette'] if image_mode == 'both' else [image_mode]
    manifest = []
    for row in selected:
        for variant in variations:
            path = row['image_path'] if variant == 'hq' else row['image_path'].replace('/hq/', '/silhouette/')
            slug = Path(path).stem.lower()
            manifest.append({
                'sample_id': f'{variant}-{row["base_id"]}-{slug}',
                'image_path': f'images/{variant}/{Path(path).name}',
                'expected_name': row['base_name'],
                'expected_id': row['base_id'],
                'generation': row['gen'],
                'variation': variant,
                'form': row.get('form', ''),
                'source_url': WTP_BASE + path,
                'sha256': '',
            })
    return manifest


def prepare(args) -> None:
    out_dir = Path(args.dataset_dir).expanduser().resolve()
    source = get_wtp_rows(out_dir, refresh=args.refresh)
    manifest = build_manifest(source, per_generation=args.per_generation, all_base=args.all_base,
                              include_forms=args.include_forms, image_mode=args.image_mode, seed=args.seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out_dir / 'manifest.csv', manifest, MANIFEST_FIELDS)
    write_json(out_dir / 'dataset_info.json', {
        'source': WTP_REPO, 'revision': WTP_COMMIT,
        'description': 'WTP-Bench curated official artwork/silhouette, Gen 1-8. Not an independent held-out test set.',
        'mode': args.image_mode, 'selection_seed': args.seed,
        'per_generation': None if args.all_base else args.per_generation,
        'include_forms': args.include_forms, 'total_samples': len(manifest),
        'image_license_notice': 'Artwork is owned by The Pokemon Company/Nintendo/Game Freak. Do not redistribute image files. See docs/DATASET_AND_RIGHTS.md.'
    })
    if args.manifest_only:
        print(f'Created {out_dir / "manifest.csv"} with {len(manifest)} entries. No images downloaded.')
        return
    failures = []
    for index, row in enumerate(manifest, 1):
        target = resolved_local_path(out_dir, row['image_path'])
        try:
            if target.exists():
                data = target.read_bytes()
                if not data.startswith(PNG_MAGIC):
                    raise ValueError('Existing file is not a PNG; delete it and retry')
            else:
                data = download_bytes(row['source_url'])
                if not data.startswith(PNG_MAGIC):
                    raise ValueError('Downloaded file is not a PNG')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            row['sha256'] = sha256(data)
        except Exception as exc:
            failures.append({'image_path': row['image_path'], 'error': str(exc)})
        if index % 20 == 0 or index == len(manifest):
            print(f'Images checked: {index}/{len(manifest)}; failures: {len(failures)}')
        # A failed download is recorded and later flagged by run(), rather than
        # incorrectly treated as a classification error.
    write_csv(out_dir / 'manifest.csv', manifest, MANIFEST_FIELDS)
    write_json(out_dir / 'download_errors.json', failures)
    print(f'Manifest: {out_dir / "manifest.csv"}')
    print(f'Downloaded/verified: {len(manifest)-len(failures)} / {len(manifest)}')
    if failures:
        raise SystemExit('Some images could not be downloaded. Re-run prepare or check download_errors.json.')
