"""Offline tests: never download copyrighted assets or model weights."""
from __future__ import annotations

import argparse
import csv
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from benchmark.common import (make_label_to_id, normalize_name, resolved_local_path,
                              read_csv, sha256, write_csv, write_json, MANIFEST_FIELDS,
                              PREDICTION_FIELDS)
from benchmark.prepare import build_manifest, select_rows
from benchmark.inference import APIClient, evaluate_sample, parse_prediction, run
from benchmark.report import calculate_group, make_report, validate_run


class TestNames(unittest.TestCase):
    def test_common_aliases(self):
        self.assertEqual(normalize_name('Nidoran♀'), 'nidoran-f')
        self.assertEqual(normalize_name('Nidoran♂'), 'nidoran-m')
        self.assertEqual(normalize_name('Mr. Mime'), 'mr-mime')
        self.assertEqual(normalize_name('Flabébé'), 'flabebe')
        self.assertEqual(normalize_name('Type: Null'), 'type-null')

    def test_label_ids_map_alternative_forms(self):
        rows = [{'base_id': '6', 'base_name': 'charizard', 'label': 'charizard-mega-x'},
                {'base_id': '29', 'base_name': 'nidoran-f', 'label': 'nidoran-f'},
                {'base_id': '487', 'base_name': 'giratina-altered', 'label': 'giratina-altered'},
                {'base_id': '413', 'base_name': 'wormadam-plant', 'label': 'wormadam-plant'}]
        m = make_label_to_id(rows)
        self.assertEqual(m['charizard-mega-x'], 6)
        self.assertEqual(m['charizard'], 6)
        self.assertEqual(m['nidoran-f'], 29)
        self.assertEqual(m['giratina'], 487)
        self.assertEqual(m['wormadam'], 413)

    def test_reject_path_traversal(self):
        with tempfile.TemporaryDirectory() as td:
            for path in ('../../etc/passwd', '/tmp/outside.png'):
                with self.assertRaises(ValueError):
                    resolved_local_path(Path(td), path)


class TestDataset(unittest.TestCase):
    SAMPLE = [
        {'image_path': 'data/images/hq/001.png', 'base_name': 'bulbasaur', 'base_id': '1', 'gen': '1', 'form': '', 'label': 'bulbasaur'},
        {'image_path': 'data/images/hq/002.png', 'base_name': 'ivysaur', 'base_id': '2', 'gen': '1', 'form': '', 'label': 'ivysaur'},
        {'image_path': 'data/images/hq/003-Mega.png', 'base_name': 'venusaur', 'base_id': '3', 'gen': '1', 'form': 'mega', 'label': 'venusaur-mega'},
        {'image_path': 'data/images/hq/152.png', 'base_name': 'chikorita', 'base_id': '152', 'gen': '2', 'form': '', 'label': 'chikorita'},
        {'image_path': 'data/images/hq/153.png', 'base_name': 'bayleef', 'base_id': '153', 'gen': '2', 'form': '', 'label': 'bayleef'},
    ]

    def test_balanced_deterministic_sampling(self):
        a = select_rows(self.SAMPLE, per_generation=1, seed=42)
        b = select_rows(self.SAMPLE, per_generation=1, seed=42)
        self.assertEqual(a, b)
        self.assertEqual(len(a), 2)
        self.assertFalse(any(x['form'] for x in a))
        self.assertEqual(set(x['gen'] for x in a), {'1', '2'})

    def test_manifest_both_variations(self):
        manifests = build_manifest(self.SAMPLE, per_generation=1, image_mode='both', seed=42)
        self.assertEqual(len(manifests), 4)
        self.assertTrue(all(x['source_url'].startswith('https://raw.githubusercontent.com/eternal-f1ame/WTP-Bench/') for x in manifests))
        self.assertEqual(set(x['variation'] for x in manifests), {'hq', 'silhouette'})
        self.assertTrue(any('/silhouette/' in x['source_url'] for x in manifests))
        self.assertTrue(all(x['expected_id'] for x in manifests))


class TestPredictions(unittest.TestCase):
    sample = {'expected_name': 'charizard', 'expected_id': '6'}
    aliases = {'charizard': 6, 'charizard-mega-x': 6, 'pikachu': 25,
               'bulbasaur': 1, 'eevee': 133, 'psyduck': 54}

    def test_no_fake_top5(self):
        name, candidates, score, available = parse_prediction({'pokemonName': 'charizard'})
        self.assertEqual(name, 'charizard')
        self.assertEqual(candidates, [])
        self.assertIsNone(score)
        self.assertFalse(available)
        result = evaluate_sample(self.sample, {'pokemonName': 'charizard'}, self.aliases)
        self.assertEqual(result['top1_correct'], 1)
        self.assertEqual(result['top5_correct'], '')

    def test_top5_from_real_candidates(self):
        data = {'pokemonName': 'pikachu', 'candidates': [
            {'pokemonName': 'pikachu', 'modelScore': 0.4},
            {'pokemonName': 'bulbasaur', 'modelScore': 0.3},
            {'pokemonName': 'eevee', 'modelScore': 0.2},
            {'pokemonName': 'charizard-mega-x', 'modelScore': 0.09},
            {'pokemonName': 'psyduck', 'modelScore': 0.01}]}
        row = evaluate_sample(self.sample, data, self.aliases)
        self.assertEqual(row['top1_correct'], 0)
        self.assertEqual(row['top5_correct'], 1)
        self.assertEqual(row['top5_available'], 1)
        self.assertEqual(row['model_score'], 0.4)

    def test_invalid_contract(self):
        for payload in ({'candidates': []}, {'pokemonName': '  '}, {'pokemonName': 'a', 'candidates': {}}):
            with self.assertRaises(ValueError):
                parse_prediction(payload)


class TestScoring(unittest.TestCase):
    def test_denominators_exclude_errors_for_classifier_accuracy(self):
        rows = [{'status': 'ok', 'top1_correct': '1', 'top5_available': '0', 'latency_ms': '10'},
                {'status': 'ok', 'top1_correct': '0', 'top5_available': '0', 'latency_ms': '20'},
                {'status': 'failed', 'top1_correct': '', 'top5_available': '0', 'latency_ms': '30'}]
        result = calculate_group(rows)
        self.assertEqual(result['top1_accuracy_percent'], 50)
        self.assertAlmostEqual(result['end_to_end_correct_percent'], 100/3)
        self.assertIsNone(result['top5_percent'])
        self.assertEqual(result['latency_ms_p50'], 15)
        self.assertEqual(result['failed'], 1)

    def test_no_false_zeros_on_total_failures(self):
        m = calculate_group([{'status': 'failed'}])
        self.assertIsNone(m['top1_accuracy_percent'])
        self.assertEqual(m['end_to_end_correct_percent'], 0)
        self.assertIsNone(m['top5_percent'])

class TestRunIntegrity(unittest.TestCase):
    def make_run(self, root: Path, *, scope='complete', status='completed', states=None):
        ds, out = root / 'dataset', root / 'run'
        (ds / 'images').mkdir(parents=True)
        samples = []
        predictions = []
        for i, name in enumerate(('pikachu', 'bulbasaur'), 1):
            image = f'images/{i}.png'
            content = f'fixture-{i}'.encode()
            (ds / image).write_bytes(content)
            samples.append({'sample_id': str(i), 'image_path': image, 'expected_name': name,
                            'expected_id': str(i), 'generation': '1', 'variation': 'hq',
                            'form': '', 'source_url': 'fixture:', 'sha256': sha256(content)})
        write_csv(ds / 'manifest.csv', samples, MANIFEST_FIELDS)
        info = {'source': 'fixture', 'revision': 'fixture', 'mode': 'hq',
                'selection_seed': 1, 'include_forms': False, 'total_samples': 2}
        write_json(ds / 'dataset_info.json', info)
        planned = samples[:1] if scope == 'partial' else samples
        for index, sample in enumerate(planned):
            state = (states or {}).get(index, 'ok')
            predictions.append({**sample, 'status': state,
                                'predicted_name': sample['expected_name'] if state == 'ok' else '',
                                'predicted_id': sample['expected_id'] if state == 'ok' else '',
                                'top1_correct': '1' if state == 'ok' else '', 'top5_correct': '',
                                'top5_available': '0', 'model_score': '', 'latency_ms': '12',
                                'attempts': '1', 'error': 'request failed' if state == 'failed' else '',
                                'failure_stage': 'request' if state == 'failed' else '',
                                'candidates_json': '[]'})
        write_csv(out / 'predictions.csv', predictions, PREDICTION_FIELDS)
        meta = {'run_id': 'fixture-run', 'status': status, 'scope': scope,
                'timestamp_started_utc': '2026-11-04T00:00:00+00:00',
                'backend': 'api', 'endpoint': 'https://fixture.invalid/classify',
                'manifest_sha256': sha256((ds / 'manifest.csv').read_bytes()),
                'dataset_files_sha256': {'manifest.csv': sha256((ds / 'manifest.csv').read_bytes()),
                                         'dataset_info.json': sha256((ds / 'dataset_info.json').read_bytes())},
                'dataset_sample_count': 2, 'planned_sample_count': len(planned),
                'dataset': {key: info.get(key) for key in ('source', 'revision', 'mode', 'selection_seed', 'include_forms')},
                'planned_sample_ids': [s['sample_id'] for s in planned],
                'max_samples': len(planned) if scope == 'partial' else None,
                'attempted': len(predictions),
                'predictions_sha256': sha256((out / 'predictions.csv').read_bytes())}
        write_json(out / 'run_metadata.json', meta)
        return ds, out, meta

    def test_rejects_interrupted_run(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, meta = self.make_run(Path(temp), status='interrupted')
            with self.assertRaisesRegex(SystemExit, 'status is'):
                validate_run(ds, out)

    def test_rejects_changed_manifest_and_dataset(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, _ = self.make_run(Path(temp))
            with (ds / 'manifest.csv').open('a') as fd:
                fd.write('\n')
            with self.assertRaisesRegex(SystemExit, 'manifest differs'):
                validate_run(ds, out)

    def test_rejects_changed_dataset_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, _ = self.make_run(Path(temp))
            write_json(ds / 'dataset_info.json', {'source': 'changed', 'revision': 'fixture',
                       'mode': 'hq', 'selection_seed': 1, 'include_forms': False, 'total_samples': 2})
            with self.assertRaisesRegex(SystemExit, 'dataset files differ'):
                validate_run(ds, out)

    def test_rejects_modified_image(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, _ = self.make_run(Path(temp))
            (ds / 'images/1.png').write_bytes(b'changed')
            with self.assertRaisesRegex(SystemExit, 'modified dataset image'):
                validate_run(ds, out)

    def test_rejects_duplicate_predictions(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, meta = self.make_run(Path(temp))
            rows = read_csv(out / 'predictions.csv')
            write_csv(out / 'predictions.csv', [rows[0], rows[0]], PREDICTION_FIELDS)
            meta['predictions_sha256'] = sha256((out / 'predictions.csv').read_bytes())
            write_json(out / 'run_metadata.json', meta)
            with self.assertRaisesRegex(SystemExit, 'duplicate prediction'):
                validate_run(ds, out)

    def test_rejects_missing_predictions(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, meta = self.make_run(Path(temp))
            rows = read_csv(out / 'predictions.csv')
            write_csv(out / 'predictions.csv', rows[:1], PREDICTION_FIELDS)
            meta['predictions_sha256'] = sha256((out / 'predictions.csv').read_bytes())
            write_json(out / 'run_metadata.json', meta)
            with self.assertRaisesRegex(SystemExit, 'count does not match'):
                validate_run(ds, out)

    def test_partial_run_is_valid_and_identified(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, meta = self.make_run(Path(temp), scope='partial')
            rows, found_meta, _ = validate_run(ds, out)
            self.assertEqual(found_meta['scope'], 'partial')
            self.assertEqual(found_meta['max_samples'], 1)
            self.assertEqual(len(rows), 1)
            metrics = make_report(argparse.Namespace(dataset_dir=str(ds), output_dir=str(out)))
            self.assertEqual(metrics['overall']['planned'], 1)

    def test_complete_run_valid_top5_unavailable_and_raw_csv_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, _ = self.make_run(Path(temp))
            raw_before = (out / 'predictions.csv').read_bytes()
            metrics = make_report(argparse.Namespace(dataset_dir=str(ds), output_dir=str(out)))
            self.assertEqual(metrics['overall']['planned'], 2)
            self.assertIsNone(metrics['overall']['top5_percent'])
            self.assertNotIn('by_class', metrics)
            self.assertNotIn('top1_accuracy_wilson95', metrics['overall'])
            self.assertFalse((out / 'per_class.csv').exists())
            self.assertFalse((out / 'common_confusions.csv').exists())
            self.assertFalse((out / 'README_SNIPPET.md').exists())
            self.assertTrue((out / 'failures_and_misclassifications.csv').exists())
            self.assertEqual((out / 'predictions.csv').read_bytes(), raw_before)

    def test_request_failures_are_not_confusion_errors(self):
        with tempfile.TemporaryDirectory() as temp:
            ds, out, _ = self.make_run(Path(temp), states={0: 'failed', 1: 'failed'})
            metrics = make_report(argparse.Namespace(dataset_dir=str(ds), output_dir=str(out)))
            self.assertEqual(metrics['overall']['failed'], 2)
            self.assertIsNone(metrics['overall']['top1_accuracy_percent'])
            errors = read_csv(out / 'failures_and_misclassifications.csv')
            self.assertTrue(all(row['failure_stage'] == 'request' for row in errors))


class StubHandler(BaseHTTPRequestHandler):
    seen = 0
    def do_POST(self):
        self.__class__.seen += 1
        content_type = self.headers.get('Content-Type', '')
        if not content_type.startswith('multipart/form-data;'):
            self.send_error(400)
            return
        length = int(self.headers.get('Content-Length', '0'))
        self.rfile.read(length)
        payload = json.dumps({'pokemonName': 'Pikachu'}).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class TestHTTPIntegration(unittest.TestCase):
    def test_local_fake_server_and_report_only(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), StubHandler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                ds = Path(temp) / 'dataset'
                output = Path(temp) / 'results'
                (ds / 'images').mkdir(parents=True)
                # Tiny fixture used ONLY by stub API, never published as an ML score.
                image_bytes = b'not-a-real-pokemon-image'
                (ds / 'images' / 'fixture.png').write_bytes(image_bytes)
                write_json(ds / 'dataset_info.json', {'source': 'fixture', 'revision': 'fixture', 'total_samples': 1})
                manifest = [{'sample_id': 'fixture', 'image_path': 'images/fixture.png',
                             'expected_name': 'pikachu-ordinary', 'expected_id': '25',
                             'generation': '1', 'variation': 'mock', 'form': '',
                             'source_url': '', 'sha256': sha256(image_bytes)}]
                write_csv(ds / 'manifest.csv', manifest, MANIFEST_FIELDS)
                write_csv(ds / 'source_metadata.csv', [{'base_id': '25',
                          'base_name': 'pikachu-ordinary', 'label': 'pikachu-ordinary'}],
                          ['base_id', 'base_name', 'label'])
                args = argparse.Namespace(dataset_dir=str(ds), output_dir=str(output),
                                          backend='api', model='N/A', timeout=2,
                                          retries=0, delay=0, max_samples=None, warmup=False,
                                          url=f'http://127.0.0.1:{server.server_port}/classify')
                run(args)
                prediction_path = output / 'predictions.csv'
                with prediction_path.open(encoding='utf-8', newline='') as fd:
                    predictions = list(csv.DictReader(fd))
                raw_before = prediction_path.read_bytes()
                stats = make_report(argparse.Namespace(dataset_dir=str(ds), output_dir=str(output)))
                self.assertEqual(stats['overall']['top1_accuracy_percent'], 100.0)
                self.assertTrue((output / 'report.md').exists())
                self.assertTrue((output / 'accuracy_by_generation.svg').exists())
                with (output / 'predictions.csv').open(encoding='utf-8', newline='') as fd:
                    self.assertEqual(len(list(csv.DictReader(fd))), 1)
                self.assertEqual(prediction_path.read_bytes(), raw_before)
                report = (output / 'report.md').read_text()
                self.assertIn('not available', report)
                self.assertIn('single-image-per-species sample', report)
                self.assertNotIn('Wilson', report)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
