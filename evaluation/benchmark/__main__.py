"""Execute with `python -m benchmark <command>`."""
import argparse
from .common import DATA_DIR, RESULTS_DIR, MODEL_ID
from .inference import DEFAULT_URL


def main() -> None:
    parser = argparse.ArgumentParser(prog='python -m benchmark',
                                     description='Pokédex model benchmark (metrics are generated only from real predictions)')
    sub = parser.add_subparsers(dest='command', required=True)
    prep = sub.add_parser('prepare', help='Select and download labeled WTP-Bench images')
    prep.add_argument('--dataset-dir', default=str(DATA_DIR))
    prep.add_argument('--per-generation', type=int, default=12)
    prep.add_argument('--all-base', action='store_true', help='Use all 905 primary-form species')
    prep.add_argument('--include-forms', action='store_true', help='Optional: also include alternate forms (species-only evaluation)')
    prep.add_argument('--image-mode', choices=['hq', 'silhouette', 'both'], default='hq')
    prep.add_argument('--seed', type=int, default=42)
    prep.add_argument('--refresh', action='store_true', help='Re-download pinned CSV metadata')
    prep.add_argument('--manifest-only', action='store_true', help='Do not download image PNGs')
    run = sub.add_parser('run', help='Execute real inference and save CSV predictions')
    run.add_argument('--dataset-dir', default=str(DATA_DIR))
    run.add_argument('--output-dir', default=str(RESULTS_DIR))
    run.add_argument('--backend', choices=['api', 'local'], default='api')
    run.add_argument('--url', default=DEFAULT_URL, help='Pokédex POST /classify API endpoint')
    run.add_argument('--model', default=MODEL_ID, help='HF model ID for --backend local')
    run.add_argument('--timeout', type=float, default=180)
    run.add_argument('--retries', type=int, default=1)
    run.add_argument('--delay', type=float, default=0.25, help='Seconds between requests')
    run.add_argument('--max-samples', type=int)
    run.add_argument('--no-warmup', dest='warmup', action='store_false')
    run.set_defaults(warmup=True)
    report = sub.add_parser('report', help='Generate actual metrics, charts and Markdown for README')
    report.add_argument('--dataset-dir', default=str(DATA_DIR))
    report.add_argument('--output-dir', default=str(RESULTS_DIR))
    custom = sub.add_parser('import-local', help='Copy manually collected labeled images by species folders')
    custom.add_argument('--source', required=True)
    custom.add_argument('--dataset-dir', default=str(DATA_DIR))
    stress = sub.add_parser('stress', help='Generate blur, JPEG, low-resolution and occluded variants (requires Pillow)')
    stress.add_argument('--dataset-dir', default=str(DATA_DIR))
    stress.add_argument('--output-dir', default='dataset_stress')
    stress.add_argument('--max-samples', type=int, default=24)
    stress.add_argument('--variants', default='jpeg35,blur2,small64,occlusion25')
    stress.add_argument('--include-original', action='store_true')
    args = parser.parse_args()
    if args.command == 'prepare':
        if args.per_generation < 1:
            parser.error('--per-generation must be >= 1')
        from .prepare import prepare
        prepare(args)
    elif args.command == 'run':
        if args.max_samples is not None and args.max_samples < 1:
            parser.error('--max-samples must be >= 1')
        if args.timeout <= 0 or args.retries < 0 or args.delay < 0:
            parser.error('--timeout must be positive; retries and delay cannot be negative')
        from .inference import run as run_benchmark
        run_benchmark(args)
    elif args.command == 'report':
        from .report import make_report
        make_report(args)
    elif args.command == 'stress':
        from .stress import prepare_stress
        prepare_stress(args)
    elif args.command == 'import-local':
        from .import_local import import_local
        import_local(args)


if __name__ == '__main__':
    main()
