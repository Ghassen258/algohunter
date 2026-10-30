"""Dependency-free adversarial input search for instrumented sorting algorithms.

Fitness is a deterministic operation count, never noisy elapsed wall time.
Genomes are permutations of 0..n-1 so every candidate is comparable.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
import random
from typing import Callable, Sequence

ALGORITHMS = {
    "quick_last": "Quicksort / last pivot",
    "quick_median3": "Quicksort / median of three",
    "insertion": "Insertion sort",
    "merge": "Merge sort",
}


def comparisons(data: Sequence[int], algorithm: str) -> int:
    """Count element-to-element comparisons made by the chosen algorithm.

    Median-of-three pivot selection comparisons count as well. Comparisons
    with loop indices, lengths and sentinel bounds are deliberately excluded.
    """
    if algorithm not in ALGORITHMS:
        raise ValueError(f"unsupported algorithm: {algorithm}")
    a = list(data)
    n = len(a)
    score = 0
    if algorithm == "insertion":
        for i in range(1, n):
            key = a[i]
            j = i - 1
            while j >= 0:
                score += 1
                if a[j] <= key:
                    break
                a[j + 1] = a[j]
                j -= 1
            a[j + 1] = key
    elif algorithm in ("quick_last", "quick_median3"):
        stack = [(0, n - 1)]
        while stack:
            left, right = stack.pop()
            if left >= right:
                continue
            if algorithm == "quick_median3":
                middle = (left + right) // 2
                # Choose median of left, middle, and right, counting each
                # element comparison as part of the algorithm's work.
                x, y, z = a[left], a[middle], a[right]
                score += 1
                if x < y:
                    score += 1
                    if y < z:
                        pivot_index = middle
                    else:
                        score += 1
                        pivot_index = right if x < z else left
                else:
                    score += 1
                    if x < z:
                        pivot_index = left
                    else:
                        score += 1
                        pivot_index = right if y < z else middle
                a[pivot_index], a[right] = a[right], a[pivot_index]
            pivot = a[right]
            boundary = left
            for i in range(left, right):
                score += 1
                if a[i] < pivot:
                    a[boundary], a[i] = a[i], a[boundary]
                    boundary += 1
            a[boundary], a[right] = a[right], a[boundary]
            stack.append((left, boundary - 1))
            stack.append((boundary + 1, right))
    else:  # merge
        def sort(values: list[int]) -> list[int]:
            nonlocal score
            if len(values) <= 1:
                return values
            mid = len(values) // 2
            left = sort(values[:mid])
            right = sort(values[mid:])
            result = []
            i = j = 0
            while i < len(left) and j < len(right):
                score += 1
                if left[i] <= right[j]:
                    result.append(left[i]); i += 1
                else:
                    result.append(right[j]); j += 1
            return result + left[i:] + right[j:]
        a = sort(a)
    assert a == sorted(data), f"instrumented {algorithm} is incorrect"
    return score


def crossover(first: Sequence[int], second: Sequence[int], rng: random.Random) -> list[int]:
    """Order crossover (OX), preserving a valid permutation without repair."""
    n = len(first)
    if n < 2:
        return list(first)
    left, right = sorted(rng.sample(range(n), 2))
    result = [-1] * n
    result[left:right + 1] = first[left:right + 1]
    existing = set(result[left:right + 1])
    remaining = [second[(right + 1 + k) % n] for k in range(n) if second[(right + 1 + k) % n] not in existing]
    positions = [(right + 1 + k) % n for k in range(n) if not left <= (right + 1 + k) % n <= right]
    for pos, gene in zip(positions, remaining):
        result[pos] = gene
    assert -1 not in result
    return result


def mutate(genes: Sequence[int], rng: random.Random) -> list[int]:
    """Swap, segment inversion, or scramble mutation; never changes values."""
    child = list(genes)
    if len(child) < 2:
        return child
    i, j = sorted(rng.sample(range(len(child)), 2))
    operation = rng.randrange(3)
    if operation == 0:
        child[i], child[j] = child[j], child[i]
    elif operation == 1:
        child[i:j + 1] = reversed(child[i:j + 1])
    else:
        part = child[i:j + 1]
        rng.shuffle(part)
        child[i:j + 1] = part
    return child


@dataclass(frozen=True)
class Config:
    algorithm: str = "quick_last"
    size: int = 32
    population: int = 40
    generations: int = 35
    seed: int = 42
    mutation_rate: float = 0.7
    elites: int = 2

    def validate(self) -> None:
        if self.algorithm not in ALGORITHMS:
            raise ValueError("unknown algorithm")
        if not 8 <= self.size <= 96:
            raise ValueError("size must be between 8 and 96")
        if not 8 <= self.population <= 120:
            raise ValueError("population must be between 8 and 120")
        if not 1 <= self.generations <= 100:
            raise ValueError("generations must be between 1 and 100")
        if not 0.0 <= self.mutation_rate <= 1.0:
            raise ValueError("mutation_rate must be in [0,1]")
        if not 1 <= self.elites < self.population:
            raise ValueError("elites must be less than population")
        if not 0 <= self.seed < 2**32:
            raise ValueError("seed must fit an unsigned 32-bit integer")


def run_experiment(config: Config, on_progress: Callable[[dict], None] | None = None) -> dict:
    """Evolve adversarial inputs; compare against equal-budget random search.

    There are population * (generations + 1) candidate evaluations per arm.
    Generation 0 is an initial random population in each arm. Later GA arms
    retain elites, so evaluations (not *unique* candidates) are budget-matched.
    """
    config.validate()
    rng = random.Random(config.seed)
    random_rng = random.Random(config.seed ^ 0x9E3779B9)
    population = [rng.sample(range(config.size), config.size) for _ in range(config.population)]
    best_score = -1
    best_genome: list[int] = []
    random_best = -1
    random_genome: list[int] = []
    history: list[dict] = []

    for generation in range(config.generations + 1):
        evaluations = [(comparisons(genome, config.algorithm), genome) for genome in population]
        evaluations.sort(key=lambda pair: pair[0], reverse=True)
        if evaluations[0][0] > best_score:
            best_score, best_genome = evaluations[0][0], evaluations[0][1].copy()
        for _ in range(config.population):
            candidate = random_rng.sample(range(config.size), config.size)
            fitness = comparisons(candidate, config.algorithm)
            if fitness > random_best:
                random_best, random_genome = fitness, candidate
        record = {
            "generation": generation,
            "best": best_score,
            "mean": round(sum(fitness for fitness, _ in evaluations) / len(evaluations), 2),
            "random_best": random_best,
            "diversity": len({tuple(genome) for _, genome in evaluations}),
            "genome": best_genome.copy(),
            "cross_algorithms": {key: (best_score if key == config.algorithm else comparisons(best_genome, key)) for key in ALGORITHMS},
        }
        history.append(record)
        if on_progress is not None:
            on_progress(record)
        if generation == config.generations:
            break

        def tournament() -> list[int]:
            candidates = rng.sample(evaluations, 3)
            return max(candidates, key=lambda pair: pair[0])[1]

        next_population = [genome.copy() for _, genome in evaluations[:config.elites]]
        while len(next_population) < config.population:
            parent_a, parent_b = tournament(), tournament()
            child = crossover(parent_a, parent_b, rng)
            if rng.random() < config.mutation_rate:
                child = mutate(child, rng)
            next_population.append(child)
        population = next_population

    return {
        "config": asdict(config),
        "algorithm_label": ALGORITHMS[config.algorithm],
        "history": history,
        "best_score": best_score,
        "best_genome": best_genome,
        "random_score": random_best,
        "random_genome": random_genome,
        "evaluations_per_strategy": config.population * (config.generations + 1),
        "other_algorithms": {key: comparisons(best_genome, key) for key in ALGORITHMS},
        "perfect_worst_case": config.size * (config.size - 1) // 2 if config.algorithm in ("quick_last", "insertion") else None,
    }


def run_experiment_json(payload: str, on_progress: Callable[[str], None] | None = None) -> str:
    """Simple JSON boundary usable from CLI and browser Pyodide worker."""
    raw = json.loads(payload)
    if not isinstance(raw, dict):
        raise ValueError("configuration must be a JSON object")
    allowed = set(Config.__dataclass_fields__)
    unexpected = set(raw) - allowed
    if unexpected:
        raise ValueError(f"unknown configuration fields: {sorted(unexpected)}")
    config = Config(**raw)
    def callback(row: dict) -> None:
        if on_progress:
            on_progress(json.dumps(row, separators=(",", ":")))
    return json.dumps(run_experiment(config, callback if on_progress else None), separators=(",", ":"))
