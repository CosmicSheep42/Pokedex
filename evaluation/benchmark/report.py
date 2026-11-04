"""Transform real predictions.csv into reproducible CSV/JSON/Markdown/SVG reports."""
from __future__ import annotations

import collections
import html
import json
import statistics
from pathlib import Path
from .common import (PREDICTION_FIELDS, RESULTS_DIR, make_label_to_id, normalize_name,
                     percent, percentile, read_csv, wilson_ci, write_csv, write_json)
from .inference import evaluate_sample


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
        'top1_accuracy_wilson95': wilson_ci(top1_count, len(success)),
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
              '<text x="32" y="56" font-size="12" font-family="Arial" fill="#555">Correct predictions / successfully processed images (not all 1,025 classes)</text>']
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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(blocks), encoding='utf-8')


def fmt(value, digits: int = 1, suffix: str = '%') -> str:
    return 'N/A' if value is None else f'{value:.{digits}f}{suffix}'


def make_report(args) -> dict:
    out = Path(args.output_dir).expanduser().resolve()
    path = out / 'predictions.csv'
    if not path.exists():
        raise SystemExit(f'Missing {path}. Run real inference first: python -m benchmark run')
    rows = read_csv(path)
    if not rows:
        raise SystemExit('No predictions found')
    info_path = Path(args.dataset_dir).expanduser().resolve() / 'dataset_info.json'
    dataset_dir = Path(args.dataset_dir).expanduser().resolve()
    info = json.loads(info_path.read_text(encoding='utf-8')) if info_path.exists() else {}
    metadata_path = dataset_dir / 'source_metadata.csv'
    aliases = make_label_to_id(read_csv(metadata_path)) if metadata_path.exists() else {}
    for row in rows:
        try:
            aliases.setdefault(normalize_name(row.get('expected_name')), int(row.get('expected_id') or ''))
        except ValueError:
            pass
        if row.get('status') == 'ok':
            try:
                payload = {'pokemonName': row['predicted_name'],
                           'candidates': json.loads(row.get('candidates_json') or '[]')}
                row.update(evaluate_sample(row, payload, aliases))
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                pass
    write_csv(path, rows, PREDICTION_FIELDS)
    meta_path = out / 'run_metadata.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
    all_metrics = calculate_group(rows)
    by_gen = {}
    for gen in sorted(set(r.get('generation') or 'unknown' for r in rows), key=str):
        by_gen[gen] = calculate_group([r for r in rows if (r.get('generation') or 'unknown') == gen])
    by_variation = {}
    for variation in sorted(set(r.get('variation') or 'unknown' for r in rows)):
        by_variation[variation] = calculate_group([r for r in rows if (r.get('variation') or 'unknown') == variation])
    by_class = {}
    for name in sorted(set(r.get('expected_name') or 'unknown' for r in rows)):
        by_class[name] = calculate_group([r for r in rows if (r.get('expected_name') or 'unknown') == name])
    errors = [r for r in rows if r.get('status') != 'ok' or not true_value(r.get('top1_correct', ''))]
    pairs = collections.Counter((r.get('expected_name') or '?', r.get('predicted_name') or '<request failed>') for r in errors)
    confusion_rows = [{'expected': pair[0], 'predicted': pair[1], 'count': count}
                      for pair, count in sorted(pairs.items(), key=lambda item: (-item[1], item[0]))]
    metrics = {
        'dataset': {'source': info.get('source', 'not recorded'),
                    'revision': info.get('revision', 'not recorded'),
                    'description': info.get('description', ''),
                    'sampling': {'seed': info.get('selection_seed'),
                                 'per_generation': info.get('per_generation'),
                                 'include_forms': info.get('include_forms')}},
        'run': meta, 'overall': all_metrics,
        'by_generation': by_gen, 'by_variation': by_variation, 'by_class': by_class,
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
    write_csv(out / 'per_class.csv', [{'expected_name': gen, **data} for gen, data in by_class.items()],
              ['expected_name', 'planned', 'successful', 'failed', 'top1_correct', 'top1_accuracy_percent'])
    write_csv(out / 'failures_and_misclassifications.csv', errors,
              ['sample_id', 'image_path', 'expected_name', 'expected_id', 'generation', 'variation',
               'status', 'predicted_name', 'predicted_id', 'top1_correct', 'top5_correct', 'error'])
    write_csv(out / 'common_confusions.csv', confusion_rows, ['expected', 'predicted', 'count'])
    render_svg_chart(by_gen, out / 'accuracy_by_generation.svg')

    dataset_name = 'WTP-Bench (official artwork, Gen 1–8)' if 'WTP-Bench' in str(info.get('source', '')) else 'user-supplied image set'
    lines = [
        '## Image classification evaluation', '',
        f'- Dataset: {dataset_name}.',
        f'- Samples attempted: **{all_metrics["planned"]}**, successful: **{all_metrics["successful"]}**, failed: **{all_metrics["failed"]}**.',
        f'- Top-1 accuracy (successful requests): **{fmt(all_metrics["top1_accuracy_percent"])}** '
        f'({all_metrics["top1_correct"]}/{all_metrics["successful"]}).',
        f'- End-to-end correct responses (failures counted as incorrect): **{fmt(all_metrics["end_to_end_correct_percent"])}** '
        f'({all_metrics["top1_correct"]}/{all_metrics["planned"]}).',
    ]
    if not all_metrics['successful']:
        lines.insert(2, '**INVALID EVALUATION RUN:** no images were successfully classified. Do not publish this as model accuracy. See failures_and_misclassifications.csv.')
        lines.insert(3, '')
    interval = all_metrics['top1_accuracy_wilson95']
    if interval:
        lines.append(f'- Indicative Wilson 95% interval (Top-1, conditional): '
                     f'**{interval[0]*100:.1f}%–{interval[1]*100:.1f}%**; valid only under simplified binomial assumptions.')
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
    lines.extend(['', '![Top-1 accuracy by generation](evaluation/results/accuracy_by_generation.svg)', '',
                  '### Scope and limitations', '',
                  'This is a **reference benchmark**, not a verified held-out test. Official artwork might overlap the training images '
                  'of the pre-existing ViT model. WTP-Bench covers Generations 1–8 only, not all 1,025 classes. '
                  'The benchmark measures species identification; alternative forms are not separately scored. '
                  'Each species has one curated image, so results do not measure variation across images or real-world accuracy. '
                  'Top-5 is reported only where the API supplies five candidates; model scores are not necessarily calibrated probabilities. '
                  'The service did not expose its exact model revision. The Wilson interval uses a simplified binomial assumption '
                  'and does not account for image-source or training overlap.', '',
                  'Reproducibility: [dataset source](https://github.com/eternal-f1ame/WTP-Bench), '
                  '[evaluation code](evaluation/benchmark/), '
                  '[predictions](evaluation/results/predictions.csv), '
                  '[metrics](evaluation/results/metrics.json).', ''])
    snippet = '\n'.join(lines)
    (out / 'README_SNIPPET.md').write_text(snippet, encoding='utf-8')
    report_snippet = snippet.replace('(evaluation/results/', '(').replace('(evaluation/benchmark/', '(../benchmark/')
    report_lines = ['# Pokédex benchmark report', '',
                    f'Benchmark executed: {meta.get("timestamp_utc", "time unknown")}', '',
                    report_snippet, '## Most frequent mistakes or request errors', '',
                    '| Expected | Predicted | Count |', '|---|---|---:|']
    report_lines.extend(f'| {a.replace("|", "/")} | {b.replace("|", "/")} | {c} |'
                        for (a, b), c in pairs.most_common(20))
    if not pairs:
        report_lines.append('| None | None | 0 |')
    report_lines.extend(['', '## Notes', '',
                         'The numeric score returned by softmax is not a calibrated probability of being correct.',
                         'An API request failure is counted in end-to-end correct rate but excluded from model-only Top-1 accuracy.',
                         'This report was generated from predictions.csv; no manual scores were supplied.', ''])
    (out / 'report.md').write_text('\n'.join(report_lines), encoding='utf-8')
    print(f'Created: {out / "metrics.json"}, {out / "report.md"}, {out / "README_SNIPPET.md"}, CSV and SVG outputs')
    print(f'Top-1 successful requests: {fmt(all_metrics["top1_accuracy_percent"])}; '
          f'end-to-end: {fmt(all_metrics["end_to_end_correct_percent"])}')
    return metrics
