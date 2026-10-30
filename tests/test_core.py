import json
import random
import subprocess
import sys
import unittest

from algohunter.core import ALGORITHMS, Config, comparisons, crossover, mutate, run_experiment, run_experiment_json


class SortingMetricsTests(unittest.TestCase):
    def test_every_algorithm_sorts_and_scores_consistently(self):
        for algorithm in ALGORITHMS:
            for size in range(0, 50):
                with self.subTest(algorithm=algorithm, size=size):
                    self.assertGreaterEqual(comparisons(list(range(size)), algorithm), 0)
                    self.assertGreaterEqual(comparisons(list(range(size-1,-1,-1)), algorithm), 0)
                    rng = random.Random(size)
                    for _ in range(5):
                        seq = rng.sample(range(size), size)
                        self.assertEqual(comparisons(seq, algorithm), comparisons(seq, algorithm))

    def test_quicksort_last_sorted_is_quadratic(self):
        for n in [2, 7, 20, 50]:
            self.assertEqual(comparisons(list(range(n)), 'quick_last'), n*(n-1)//2)
            self.assertEqual(comparisons(list(range(n-1,-1,-1)), 'quick_last'), n*(n-1)//2)

    def test_insertion_sort_counts(self):
        self.assertEqual(comparisons([0,1,2,3,4], 'insertion'), 4)
        self.assertEqual(comparisons([4,3,2,1,0], 'insertion'), 10)

    def test_unknown_algorithm(self):
        with self.assertRaisesRegex(ValueError, 'unsupported'):
            comparisons([1,2], 'bogus')


class GeneticsTests(unittest.TestCase):
    def test_permutation_invariants(self):
        rng = random.Random(63)
        for n in [2, 8, 15, 45, 96]:
            expected = list(range(n))
            for _ in range(100):
                a = rng.sample(expected, n)
                b = rng.sample(expected, n)
                self.assertEqual(sorted(crossover(a, b, rng)), expected)
                self.assertEqual(sorted(mutate(a, rng)), expected)
                self.assertEqual(sorted(a), expected)  # original permutations intact

    def test_reproducible(self):
        config=Config(size=16,population=12,generations=8,seed=10)
        self.assertEqual(run_experiment(config),run_experiment(config))

    def test_fair_budget_and_monotonicity(self):
        config=Config(size=16,population=12,generations=8,seed=10)
        report=run_experiment(config)
        self.assertEqual(len(report['history']),9)
        self.assertEqual(report['evaluations_per_strategy'],12*9)
        for prev,nxt in zip(report['history'],report['history'][1:]):
            self.assertGreaterEqual(nxt['best'],prev['best'])
            self.assertGreaterEqual(nxt['random_best'],prev['random_best'])
        self.assertEqual(report['best_score'],comparisons(report['best_genome'],config.algorithm))
        self.assertEqual(report['random_score'],comparisons(report['random_genome'],config.algorithm))
        for row in report['history']:
            self.assertEqual(sorted(row['genome']),list(range(config.size)))
            self.assertEqual(row['best'], comparisons(row['genome'],config.algorithm))
            self.assertEqual(row['cross_algorithms'][config.algorithm],row['best'])

    def test_progress_and_json_bridge(self):
        updates=[]
        output=run_experiment_json(json.dumps({'size':8,'population':8,'generations':4}),updates.append)
        parsed=json.loads(output)
        self.assertEqual(len(updates),5)
        self.assertEqual(json.loads(updates[-1])['best'],parsed['best_score'])
        self.assertEqual(parsed['history'][-1]['cross_algorithms'],parsed['other_algorithms'])

    def test_config_validation(self):
        for options in [
            {'algorithm':'not_real'}, {'size':3}, {'population':7},
            {'generations':0}, {'seed':-1}, {'seed':2**32},
            {'mutation_rate':-0.1}, {'mutation_rate':1.2}, {'elites':99},
        ]:
            with self.subTest(options=options):
                with self.assertRaises(ValueError):
                    run_experiment(Config(**options))
        with self.assertRaises(ValueError):
            run_experiment_json('{"unexpected":true}')
        with self.assertRaises(ValueError):
            run_experiment_json('[]')

    def test_every_algorithm_runs(self):
        for algorithm in ALGORITHMS:
            with self.subTest(algorithm=algorithm):
                r=run_experiment(Config(algorithm=algorithm,size=8,population=8,generations=2))
                self.assertIn(algorithm,r['other_algorithms'])

    def test_cli_json_output(self):
        proc=subprocess.run([sys.executable,'-m','algohunter','--json','--size','8','--population','8','--generations','1'],capture_output=True,text=True,check=True)
        r=json.loads(proc.stdout)
        self.assertEqual(r['evaluations_per_strategy'],16)

if __name__=='__main__':
    unittest.main()
