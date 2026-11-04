"""Import images supplied by the user: src/<species>/*.png|jpg|webp."""
from __future__ import annotations

import mimetypes
import shutil
from pathlib import Path
from .common import MANIFEST_FIELDS, normalize_name, sha256, write_csv, write_json

EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}


def import_local(args) -> None:
    source = Path(args.source).expanduser().resolve()
    out = Path(args.dataset_dir).expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f'Source directory does not exist: {source}')
    if source == out or out.is_relative_to(source):
        raise SystemExit('Output must be outside the source image directory')
    rows = []
    for folder in sorted(source.iterdir()):
        if not folder.is_dir():
            continue
        expected = normalize_name(folder.name)
        for index, image in enumerate(sorted(folder.iterdir()), 1):
            if not image.is_file() or image.suffix.lower() not in EXTENSIONS:
                continue
            sample_id = f'custom-{expected}-{index:04d}'
            relative = Path('images') / 'custom' / f'{sample_id}{image.suffix.lower()}'
            destination = out / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(image, destination)
            rows.append({'sample_id': sample_id, 'image_path': relative.as_posix(),
                         'expected_name': expected, 'expected_id': '', 'generation': '',
                         'variation': 'custom', 'form': '', 'source_url': '',
                         'sha256': sha256(destination.read_bytes())})
    if not rows:
        raise SystemExit('No images found. Organize as <source>/<pokemon-name>/<image>.png')
    write_csv(out / 'manifest.csv', rows, MANIFEST_FIELDS)
    write_json(out / 'dataset_info.json', {'source': 'user supplied images', 'total_samples': len(rows),
                                          'description': 'User-supplied images, independence of training data must be verified by the author.',
                                          'image_license_notice': 'User is responsible for image permissions and labels.'})
    print(f'Imported {len(rows)} images to {out}; review labels before reporting results.')
