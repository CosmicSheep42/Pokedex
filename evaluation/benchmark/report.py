"""Transform real predictions.csv into reproducible CSV/JSON/Markdown/SVG reports."""
from __future__ import annotations

import html
import json
import os
import statistics
from pathlib import Path
from .common import (PREDICTION_FIELDS, percent, percentile, read_csv,
                     resolved_local_path, sha256,
                     write_csv, write_json, write_text)


def true_value(value) -> bool:
    return str(value).strip().lower() in ('true', '1', 'yes')


def calculate_group(rows: list[dict[str, str]]) -> dict:
    planned = len(rows)
    success = [r for r in rows if r.get('status') == 'ok']
    top1_count = sum(true_value(r.get('top1_correct', '')) for r in success)
    with_top5 = [r for r in success if true_value(r.get('top5_available', ''))]
    top5_count = sum(true_value(r.get('top5_correct', '')) for r in with_top5)
    latencies = []
    for row in success:
        try:
            latencies.append(float(row['latency_ms']))
        except (TypeError, ValueError, KeyError):
            pass
    return {
        'planned': planned, 'successful': len(success), 'failed': planned - len(success),
        'failed_percent': percent(planned - len(success), planned),
        'top1_correct': top1_count, 'top1_accuracy_percent': percent(top1_count, len(success)),
        'end_to_end_correct_percent': percent(top1_count, planned),
        'top5_correct': top5_count, 'top5_measured': len(with_top5),
        'top5_percent': percent(top5_count, len(with_top5)),
        'top5_coverage_percent': percent(len(with_top5), len(success)),
        'latency_ms_avg': round(statistics.mean(latencies), 2) if latencies else None,
        'latency_ms_p50': round(percentile(latencies, 0.50), 2) if latencies else None,
        'latency_ms_p95': round(percentile(latencies, 0.95), 2) if latencies else None,
        'latency_samples': len(latencies),
    }


def render_svg_chart(metrics_by_gen: dict, path: Path) -> None:
    entries = [(str(gen), obj.get('top1_accuracy_percent'), obj['successful'])
               for gen, obj in sorted(metrics_by_gen.items(), key=lambda item: (not item[0].isdigit(), int(item[0]) if item[0].isdigit() else item[0]))]
    entries = [entry for entry in entries if entry[1] is not None]
    if not entries:
        return
    bar_w = 50
    gap = 28
    chart_h = 210
    width = max(550, 95 + (bar_w + gap) * len(entries))
    height = 360
    blocks = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Top-1 accuracy per generation">',
              '<rect width="100%" height="100%" fill="#fff"/>',
              '<text x="32" y="35" font-size="20" font-family="Arial" fill="#222" font-weight="bold">Top-1 accuracy by generation</text>',
              '<text x="32" y="56" font-size="12" font-family="Arial" fill="#555">One curated image per species; descriptive, not a generalization estimate</text>']
    for v in (0, 25, 50, 75, 100):
        y = 280 - v/100 * chart_h
        blocks.append(f'<line x1="65" x2="{width-25}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>')
        blocks.append(f'<text x="25" y="{y+5:.1f}" font-size="12" font-family="Arial" fill="#555">{v}%</text>')
    for i, (gen, accuracy, n) in enumerate(entries):
        x = 85 + i * (bar_w + gap)
        bh = accuracy/100 * chart_h
        y = 280 - bh
        blocks.append(f'<rect x="{x}" y="{y:.1f}" width="{bar_w}" height="{bh:.1f}" fill="#2563eb" rx="4"/>')
        blocks.append(f'<text x="{x+bar_w/2}" y="{max(y-7,65):.1f}" text-anchor="middle" font-size="11" font-family="Arial" fill="#222">{accuracy:.1f}%</text>')
        blocks.append(f'<text x="{x+bar_w/2}" y="302" text-anchor="middle" font-size="13" font-family="Arial" fill="#222">Gen {html.escape(gen)}</text>')
        blocks.append(f'<text x="{x+bar_w/2}" y="320" text-anchor="middle" font-size="11" font-family="Arial" fill="#555">n={n}</text>')
    blocks.append('</svg>')
    write_text(path, '\n'.join(blocks))


def fmt(value, digits: int = 1, suffix: str = '%') -> str:
    return 'N/A' if value is None else f'{value:.{digits}f}{suffix}'


def validate_run(dataset_dir: Path, out: Path) -> tuple[list[dict[str, str]], dict, dict]:
    """Reject incomplete or mismatched runs before producing any report files."""
    manifest_path = dataset_dir / 'manifest.csv'
    info_path = dataset_dir / 'dataset_info.json'
    metadata_path = out / 'run_metadata.json'
    predictions_path = out / 'predictions.csv'
    for path in (manifest_path, info_path, metadata_path, predictions_path):
        if not path.is_file():
            raise SystemExit(f'Invalid benchmark run: required file missing: {path}')
    manifest_hash = sha256(manifest_path.read_bytes())
    meta = json.loads(metadata_path.read_text(encoding='utf-8'))
    if meta.get('model_identity', {}).get('status') == 'inconsistent':
        raise SystemExit('Invalid benchmark run: model identity changed during inference')
    if meta.get('status') != 'completed':
        raise SystemExit(f'Invalid benchmark run: status is {meta.get("status", "missing")!r}, expected completed')
    if not meta.get('run_id') or not meta.get('timestamp_started_utc'):
        raise SystemExit('Invalid benchmark run: run identity or start time is missing')
    if meta.get('backend') not in ('api', 'local'):
        raise SystemExit('Invalid benchmark run: backend identity is missing')
    if (meta.get('backend') == 'api' and not meta.get('endpoint')) or (meta.get('backend') == 'local' and not meta.get('model_id')):
        raise SystemExit('Invalid benchmark run: backend endpoint or model ID is missing')
    if meta.get('manifest_sha256') != manifest_hash:
        raise SystemExit('Invalid benchmark run: current manifest differs from the manifest used for inference')
    expected_files = {'manifest.csv': manifest_hash}
    for name in ('dataset_info.json', 'source_metadata.csv'):
        path = dataset_dir / name
        if path.exists():
            expected_files[name] = sha256(path.read_bytes())
    if meta.get('dataset_files_sha256') != expected_files:
        raise SystemExit('Invalid benchmark run: dataset files differ from those used for inference')
    manifest_rows = read_csv(manifest_path)
    if meta.get('dataset_sample_count') != len(manifest_rows):
        raise SystemExit('Invalid benchmark run: dataset sample count differs from run metadata')
    manifest_ids = [r.get('sample_id', '') for r in manifest_rows]
    if not manifest_ids or any(not sample_id for sample_id in manifest_ids) or len(set(manifest_ids)) != len(manifest_ids):
        raise SystemExit('Invalid benchmark run: manifest has missing or duplicate sample IDs')
    rows = read_csv(predictions_path)
    if not rows or list(rows[0].keys()) != PREDICTION_FIELDS:
        raise SystemExit('Invalid benchmark run: predictions.csv is empty or has an unexpected schema')
    planned_ids = meta.get('planned_sample_ids')
    row_ids = [row.get('sample_id', '') for row in rows]
    if (not isinstance(planned_ids, list) or not planned_ids
            or any(not isinstance(sample_id, str) or not sample_id for sample_id in planned_ids)
            or len(set(planned_ids)) != len(planned_ids)):
        raise SystemExit('Invalid benchmark run: planned sample IDs are missing or duplicated')
    if len(row_ids) != meta.get('planned_sample_count') or len(rows) != meta.get('attempted'):
        raise SystemExit('Invalid benchmark run: prediction count does not match run metadata')
    if len(set(row_ids)) != len(row_ids):
        raise SystemExit('Invalid benchmark run: duplicate prediction sample IDs')
    if row_ids != planned_ids:
        raise SystemExit('Invalid benchmark run: predicted IDs do not match planned IDs')
    if meta.get('scope') == 'complete':
        if planned_ids != manifest_ids:
            raise SystemExit('Invalid benchmark run: complete run does not cover the current manifest')
    elif meta.get('scope') != 'partial':
        raise SystemExit('Invalid benchmark run: unknown execution scope')
    if meta.get('scope') == 'partial' and not isinstance(meta.get('max_samples'), int):
        raise SystemExit('Invalid benchmark run: partial run has no --max-samples limit')
    if meta.get('scope') == 'partial':
        expected_partial_ids = manifest_ids[:meta['max_samples']]
        if planned_ids != expected_partial_ids:
            raise SystemExit('Invalid benchmark run: partial IDs do not match --max-samples selection')
    manifest_by_id = {r['sample_id']: r for r in manifest_rows}
    for row in rows:
        if row.get('status') not in ('ok', 'failed'):
            raise SystemExit(f'Invalid benchmark run: invalid sample status for {row.get("sample_id")}')
        source = manifest_by_id.get(row['sample_id'])
        if source is None or any(row.get(key, '') != source.get(key, '') for key in
                                 ('image_path', 'expected_name', 'expected_id', 'generation', 'variation', 'form')):
            raise SystemExit(f'Invalid benchmark run: prediction metadata differs for {row["sample_id"]}')
    for sample_id in planned_ids:
        sample = manifest_by_id[sample_id]
        image_path = resolved_local_path(dataset_dir, sample['image_path'])
        if not image_path.is_file() or not sample.get('sha256') or sha256(image_path.read_bytes()) != sample['sha256']:
            raise SystemExit(f'Invalid benchmark run: missing or modified dataset image for {sample_id}')
    if meta.get('predictions_sha256') != sha256(predictions_path.read_bytes()):
        raise SystemExit('Invalid benchmark run: predictions.csv checksum does not match execution metadata')
    info = json.loads(info_path.read_text(encoding='utf-8'))
    if info.get('total_samples') is not None and info['total_samples'] != len(manifest_rows):
        raise SystemExit('Invalid benchmark run: dataset_info sample count differs from manifest')
    expected_dataset = {'source': info.get('source'), 'revision': info.get('revision'),
                        'mode': info.get('mode'), 'selection_seed': info.get('selection_seed'),
                        'include_forms': info.get('include_forms')}
    if meta.get('dataset') != expected_dataset:
        raise SystemExit('Invalid benchmark run: dataset identity differs from run metadata')
    return rows, meta, info


def make_report(args) -> dict:
    out = Path(args.output_dir).expanduser().resolve()
    dataset_dir = Path(args.dataset_dir).expanduser().resolve()
    rows, meta, info = validate_run(dataset_dir, out)
    report_path = out / 'report.md'

    def relative_target(target: Path) -> str:
        return Path(os.path.relpath(target, report_path.parent)).as_posix()

    def local_link(label: str, target: Path) -> str:
        return f'[{label}]({relative_target(target)})'

    project_root = Path(__file__).resolve().parents[2]

    all_metrics = calculate_group(rows)
    by_gen = {}
    for gen in sorted(set(r.get('generation') or 'unknown' for r in rows), key=str):
        by_gen[gen] = calculate_group([r for r in rows if (r.get('generation') or 'unknown') == gen])
    by_variation = {}
    for variation in sorted(set(r.get('variation') or 'unknown' for r in rows)):
        by_variation[variation] = calculate_group([r for r in rows if (r.get('variation') or 'unknown') == variation])
    errors = [r for r in rows if r.get('status') != 'ok' or not true_value(r.get('top1_correct', ''))]
    metrics = {
        'dataset': {'source': info.get('source', 'not recorded'),
                    'revision': info.get('revision', 'not recorded'),
                    'description': info.get('description', ''),
                    'sampling': {'seed': info.get('selection_seed'),
                                 'per_generation': info.get('per_generation'),
                                 'include_forms': info.get('include_forms')}},
        'run': meta, 'overall': all_metrics,
        'by_generation': by_gen, 'by_variation': by_variation,
        'interpretation': 'Reference benchmark; art may overlap pretraining/fine-tuning. Scores are not necessarily calibrated probabilities.'
    }
    write_json(out / 'metrics.json', metrics)
    write_csv(out / 'per_generation.csv', [{'generation': gen, **data} for gen, data in by_gen.items()],
              ['generation', 'planned', 'successful', 'failed', 'top1_correct', 'top1_accuracy_percent',
               'end_to_end_correct_percent', 'top5_correct', 'top5_measured', 'top5_percent',
               'latency_ms_p50', 'latency_ms_p95'])
    write_csv(out / 'per_variation.csv', [{'variation': gen, **data} for gen, data in by_variation.items()],
              ['variation', 'planned', 'successful', 'failed', 'top1_correct', 'top1_accuracy_percent',
               'end_to_end_correct_percent', 'top5_correct', 'top5_measured', 'top5_percent',
               'latency_ms_p50', 'latency_ms_p95'])
    write_csv(out / 'failures_and_misclassifications.csv', errors,
              ['sample_id', 'image_path', 'expected_name', 'expected_id', 'generation', 'variation',
               'status', 'predicted_name', 'predicted_id', 'top1_correct', 'top5_correct',
               'failure_stage', 'error'])
    render_svg_chart(by_gen, out / 'accuracy_by_generation.svg')

    dataset_name = 'WTP-Bench (official artwork, Gen 1–8)' if 'WTP-Bench' in str(info.get('source', '')) else 'user-supplied image set'
    model_id = meta.get('backend_model') or meta.get('model_id') or 'not reported'
    model_revision = meta.get('model_revision') or 'not reported'
    backend_revision = meta.get('backend_revision') or 'not reported'
    lines = [
        '## Image classification evaluation', '',
        f'- Dataset: {dataset_name}.',
        f'- Backend code revision: `{backend_revision}`; model: `{model_id}`; weights revision: `{model_revision}`.',
        f'- Samples attempted: **{all_metrics["planned"]}**, successful: **{all_metrics["successful"]}**, failed: **{all_metrics["failed"]}**.',
        f'- Top-1 accuracy (successful requests): **{fmt(all_metrics["top1_accuracy_percent"])}** '
        f'({all_metrics["top1_correct"]}/{all_metrics["successful"]}).',
        f'- End-to-end correct responses (failures counted as incorrect): **{fmt(all_metrics["end_to_end_correct_percent"])}** '
        f'({all_metrics["top1_correct"]}/{all_metrics["planned"]}).',
    ]
    if not all_metrics['successful']:
        lines.insert(2, '**INVALID EVALUATION RUN:** no images were successfully classified. Do not publish this as model accuracy. See failures_and_misclassifications.csv.')
        lines.insert(3, '')
    if all_metrics['top5_measured']:
        lines.append(f'- Top-5 accuracy: **{fmt(all_metrics["top5_percent"])}** '
                     f'({all_metrics["top5_correct"]}/{all_metrics["top5_measured"]}; '
                     f'coverage: {fmt(all_metrics["top5_coverage_percent"])} of successful responses).')
    else:
        lines.append('- Top-5 accuracy: **not available** (API did not return five usable candidates).')
    lines.extend([
        f'- End-to-end latency p50/p95: **{fmt(all_metrics["latency_ms_p50"], 0, " ms")} / '
        f'{fmt(all_metrics["latency_ms_p95"], 0, " ms")}** (successes only; includes network and retries in API mode).',
        '',
        '### Accuracy by generation', '',
        '| Generation | Top-1 | Correct / successful | Failed |', '|---|---:|---:|---:|',
    ])
    for gen, gm in sorted(by_gen.items(), key=lambda p: p[0]):
        lines.append(f'| {gen} | {fmt(gm["top1_accuracy_percent"])} | {gm["top1_correct"]}/{gm["successful"]} | {gm["failed"]} |')
    if len(by_variation) > 1:
        lines.extend(['', '### Accuracy by image condition', '',
                      '| Condition | Top-1 | Correct / successful | Failed |', '|---|---:|---:|---:|'])
        for variation, vm in sorted(by_variation.items()):
            lines.append(f'| {variation} | {fmt(vm["top1_accuracy_percent"])} | {vm["top1_correct"]}/{vm["successful"]} | {vm["failed"]} |')
    lines.extend(['', f'![Top-1 accuracy by generation]({relative_target(out / "accuracy_by_generation.svg")})', '',
                  '### Scope and limitations', '',
                  'This is a **reference benchmark** of a third-party pre-trained ViT model, not a verified held-out test. '
                  'Official artwork might overlap the training images; the WTP-Bench dataset is not proven independent of training. '
                  'It covers Generations 1–8 only, not all 1,025 classes. '
                  'The benchmark measures species identification; alternative forms are not separately scored. '
                  'Each species has one curated image, so results do not measure variation across images or real-world accuracy. '
                  'Top-5 is reported only where the API supplies five candidates; model scores are not necessarily calibrated probabilities. '
                  'The generation chart is descriptive and uses the same single-image-per-species sample; it is not evidence of '
                  'generalization within each generation.', '',
                  f'Reproducibility: {local_link("dataset manifest", dataset_dir / "manifest.csv")}, '
                  f'{local_link("dataset metadata", dataset_dir / "dataset_info.json")}, '
                  '[WTP-Bench source](https://github.com/eternal-f1ame/WTP-Bench), '
                  f'{local_link("evaluation code", project_root / "evaluation/benchmark")}, '
                  f'{local_link("predictions", out / "predictions.csv")}, '
                  f'{local_link("metrics", out / "metrics.json")}.', ''])
    report_lines = ['# Pokédex benchmark report', '',
                    f'Run ID: `{meta.get("run_id", "unknown")}`; scope: **{meta.get("scope", "unknown")}**; '
                    f'started: {meta.get("timestamp_started_utc", "time unknown")}', '',
                    *lines[1:],
                    '## Errors and misclassifications', '',
                    'The complete per-sample list, including expected species, prediction, generation, and sample ID, '
                    f'is in {local_link("failures_and_misclassifications.csv", out / "failures_and_misclassifications.csv")}.', '',
                    '## Notes', '',
                         'The numeric score returned by softmax is not a calibrated probability of being correct.',
                         'Request failures are distinguished from classifier errors and excluded from model-only Top-1 accuracy.',
                         f'Model identity consistency: `{meta.get("model_identity", {}).get("status", "not recorded for this run")}`.',
                         'This report was generated from predictions.csv; no manual scores were supplied.']
    write_text(report_path, '\n'.join(report_lines))
    print(f'Created: {out / "metrics.json"}, {out / "report.md"}, per-generation/per-variation CSV, errors CSV, and SVG')
    print(f'Top-1 successful requests: {fmt(all_metrics["top1_accuracy_percent"])}; '
          f'end-to-end: {fmt(all_metrics["end_to_end_correct_percent"])}')
    return metrics
