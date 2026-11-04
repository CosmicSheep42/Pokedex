"""Optional controlled transformations of locally downloaded images (Pillow)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from .common import MANIFEST_FIELDS, read_csv, resolved_local_path, sha256, write_csv, write_json

VARIANTS = ('jpeg35', 'blur2', 'small64', 'occlusion25')


def prepare_stress(args) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError as exc:
        raise SystemExit('Stress mode needs Pillow: pip install Pillow') from exc
    source = Path(args.dataset_dir).expanduser().resolve()
    out = Path(args.output_dir).expanduser().resolve()
    if source == out or out.is_relative_to(source):
        raise SystemExit('Stress output must be separate from the source directory')
    original_rows = read_csv(source / 'manifest.csv')
    selected = [row for row in original_rows if row.get('variation') == 'hq']
    if args.max_samples:
        selected = selected[:args.max_samples]
    if not selected:
        raise SystemExit('No HQ images found. Prepare with --image-mode hq or both first.')
    variants = [x.strip() for x in args.variants.split(',') if x.strip()]
    if not variants or any(x not in VARIANTS for x in variants):
        raise SystemExit(f'Available variants: {", ".join(VARIANTS)}')
    out.mkdir(parents=True, exist_ok=True)
    metadata = source / 'source_metadata.csv'
    if metadata.exists():
        shutil.copyfile(metadata, out / metadata.name)
    rows = []
    for row in selected:
        src = resolved_local_path(source, row['image_path'])
        if not src.is_file():
            raise SystemExit(f'Missing image: {src}')
        with Image.open(src) as raw:
            image = raw.convert('RGBA')
            background = Image.new('RGBA', image.size, (255, 255, 255, 255))
            background.alpha_composite(image)
            image = background.convert('RGB')
        if args.include_original:
            dest_rel = Path('images') / 'hq' / src.name
            dest = out / dest_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
            rows.append({**row, 'image_path': dest_rel.as_posix(), 'sha256': sha256(dest.read_bytes())})
        for variant in variants:
            transformed = image.copy()
            ext = '.jpg' if variant == 'jpeg35' else '.png'
            if variant == 'blur2':
                transformed = transformed.filter(ImageFilter.GaussianBlur(radius=2))
            elif variant == 'small64':
                w, h = transformed.size
                factor = 64 / max(w, h)
                small = transformed.resize((max(1, round(w*factor)), max(1, round(h*factor))), Image.Resampling.BICUBIC)
                transformed = small.resize((w, h), Image.Resampling.BICUBIC)
            elif variant == 'occlusion25':
                w, h = transformed.size
                x0, x1 = round(w*.25), round(w*.75)
                y0, y1 = round(h*.25), round(h*.75)
                ImageDraw.Draw(transformed).rectangle((x0, y0, x1, y1), fill=(120, 120, 120))
            dest_rel = Path('images') / variant / f'{Path(src.name).stem}{ext}'
            dest = out / dest_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if variant == 'jpeg35':
                transformed.save(dest, format='JPEG', quality=35, subsampling=2)
            else:
                transformed.save(dest, format='PNG')
            rows.append({**row, 'sample_id': f'{row["sample_id"]}-{variant}',
                         'image_path': dest_rel.as_posix(), 'variation': variant,
                         'sha256': sha256(dest.read_bytes()), 'source_url': row.get('source_url', '')})
    write_csv(out / 'manifest.csv', rows, MANIFEST_FIELDS)
    base_info_path = source / 'dataset_info.json'
    base = json.loads(base_info_path.read_text(encoding='utf-8')) if base_info_path.exists() else {}
    write_json(out / 'dataset_info.json', {**base, 'total_samples': len(rows),
        'description': 'Synthetic distortions of WTP-Bench HQ art, correlated with originals; not independent test samples.',
        'stress_variants': variants, 'stress_seed': None,
        'note': 'Do not pool originals and transformed copies when claiming independent-sample statistical confidence.'})
    print(f'Generated {len(rows)} evaluation inputs at {out / "manifest.csv"}.')
