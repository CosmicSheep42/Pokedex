"""Helpers shared by dataset preparation, inference, and reporting (stdlib only)."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import os
import tempfile
import unicodedata
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'dataset'
RESULTS_DIR = BASE_DIR / 'results'

# External benchmark version pinned to a concrete public Git commit.
WTP_COMMIT = '5e96847cbabb1da6e28d85bae672f8f4e247322e'
WTP_BASE = f'https://raw.githubusercontent.com/eternal-f1ame/WTP-Bench/{WTP_COMMIT}/'
WTP_REPO = 'https://github.com/eternal-f1ame/WTP-Bench'
MODEL_ID = 'skshmjn/Pokemon-classifier-gen9-1025'

MANIFEST_FIELDS = ['sample_id', 'image_path', 'expected_name', 'expected_id', 'generation',
                   'variation', 'form', 'source_url', 'sha256']
PREDICTION_FIELDS = ['sample_id', 'image_path', 'expected_name', 'expected_id', 'generation',
                     'variation', 'form', 'status', 'predicted_name', 'predicted_id',
                     'top1_correct', 'top5_correct', 'top5_available', 'model_score',
                     'latency_ms', 'attempts', 'error', 'failure_stage', 'candidates_json']


def normalize_name(name: object) -> str:
    text = str(name or '').strip().lower()
    text = text.replace('♀', '-f').replace('♂', '-m')
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace('’', '').replace("'", '').replace(':', '-')
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    text = re.sub(r'-+', '-', text)
    synonyms = {'nidoranf': 'nidoran-f', 'nidoranm': 'nidoran-m',
                'type-null': 'type-null', 'typenull': 'type-null',
                'mime-jr': 'mime-jr', 'mr-mime': 'mr-mime', 'mr-rime': 'mr-rime',
                'flabebe': 'flabebe'}
    return synonyms.get(text, text)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open('r', encoding='utf-8-sig', newline='') as fd:
        return list(csv.DictReader(fd))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', newline='', dir=path.parent,
                                     delete=False) as fd:
        temp_path = Path(fd.name)
        writer = csv.DictWriter(fd, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temp_path, path)


def write_json(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as fd:
        temp_path = Path(fd.name)
        fd.write(content)
    os.replace(temp_path, path)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as fd:
        temp_path = Path(fd.name)
        fd.write(content)
    os.replace(temp_path, path)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolved_local_path(dataset_dir: Path, relative_name: str) -> Path:
    """Do not allow CSV data to refer to paths outside the dataset directory."""
    root = dataset_dir.resolve()
    relative = Path(relative_name)
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError(f'Invalid image path: {relative_name!r}')
    full = (root / relative).resolve()
    if not full.is_relative_to(root):
        raise ValueError(f'Image path outside dataset: {relative_name!r}')
    return full


def make_label_to_id(source_rows: list[dict[str, str]]) -> dict[str, int]:
    """Normalize predicted model names to species IDs using metadata from all 905 species."""
    aliases = {}
    for row in source_rows:
        try:
            species_id = int(row.get('base_id') or row.get('expected_id'))
        except (ValueError, TypeError):
            continue
        for key in ('base_name', 'label', 'expected_name'):
            value = normalize_name(row.get(key, ''))
            if value:
                aliases[value] = species_id
        aliases[str(species_id)] = species_id
        # WTP has several base names with a default form suffix; the model may return
        # the generic species (e.g. 'basculegion' instead of 'basculegion-male').
        for suffix in ('-male', '-female', '-incarnate', '-single-strike', '-ice-face',
                       '-normal', '-ordinary', '-land', '-midday', '-average', '-shield',
                       '-altered', '-red-striped', '-standard', '-aria', '-50', '-baile',
                       '-solo', '-red-meteor', '-disguised', '-amped', '-ice', '-full-belly',
                       '-plant'):
            base_name = normalize_name(row.get('base_name', ''))
            if base_name.endswith(suffix):
                aliases.setdefault(base_name[:-len(suffix)], species_id)
    return aliases


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    pos = (len(sorted_values) - 1) * fraction
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return sorted_values[lower]
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * (pos - lower)


def percent(numerator: int, denominator: int) -> float | None:
    return 100.0 * numerator / denominator if denominator else None
