"""Command line entry point: python -m algohunter --help."""
import argparse
import json
from .core import ALGORITHMS, Config, run_experiment


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Evolve adversarial inputs for sorting algorithms")
    parser.add_argument("--algorithm", choices=ALGORITHMS, default="quick_last")
    parser.add_argument("--size", type=int, default=32)
    parser.add_argument("--population", type=int, default=40)
    parser.add_argument("--generations", type=int, default=35)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--mutation-rate", type=float, default=0.7)
    parser.add_argument("--json", action="store_true", help="Print complete machine-readable result")
    args = parser.parse_args(argv)
    try:
        config = Config(algorithm=args.algorithm, size=args.size,
                        population=args.population, generations=args.generations,
                        seed=args.seed, mutation_rate=args.mutation_rate)
        result = run_experiment(config)
    except ValueError as exc:
        parser.error(str(exc))
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("\n  A L G O / H U N T E R    -- EVOLUTION REPORT")
        print("  " + "─" * 48)
        print(f"  Target         {result['algorithm_label']}")
        print(f"  Genome size    {args.size}")
        print(f"  Generations    {args.generations}")
        print(f"  Seed           {args.seed}")
        print(f"  Budget / arm   {result['evaluations_per_strategy']:,} evaluations")
        print(f"  Genetic best   {result['best_score']:,} comparisons")
        print(f"  Random best    {result['random_score']:,} comparisons")
        print(f"  Difference     {result['best_score'] - result['random_score']:+,} comparisons")
        print(f"  Best input     {result['best_genome']}")
        print("\n  Progress (gen / GA best / random best)")
        gap = max(1, len(result["history"]) // 10)
        for row in result["history"][::gap]:
            print(f"  {row['generation']:>4}   {row['best']:>7}   {row['random_best']:>7}")
        print()
    return 0
