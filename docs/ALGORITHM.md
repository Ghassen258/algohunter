# Inside the hunter

## What is the learning component?

**Evolutionary search**, a population-based optimization heuristic. It is not an LLM, pretrained model, or a neural network. The system progressively searches for inputs that maximize a measured objective. It learns *which candidate permutations perform well under selection*; no training data or API keys are needed.

We define a genome as a permutation of integers `0..n-1`. This keeps input length, value set, and uniqueness constant so comparisons are fair.

### Fitness

Each target sorter is instrumented to count **element-to-element comparisons**. This is deterministic for a given input and implementation, unlike wall-clock timing, which depends on unrelated CPU activity. For median-of-three quicksort, comparisons made to select the pivot also count. Allocations, loop bounds checks, and memory writes do not count.

### Evolution

- **Generation 0**: Random permutations seeded by a reproducible PRNG.
- **Selection**: Three-way tournament selection favors higher fitness.
- **Recombination**: Order crossover copies a segment from parent A and fills gaps from parent B in order. Children remain valid permutations.
- **Mutation**: Swap two positions, invert a subsequence, or shuffle a subsequence (chosen uniformly).
- **Elitism**: Carry forward the best two genomes unchanged.
- **Termination**: Stop after a fixed number of generations; retain the best candidate found.

### Baseline

An **independently seeded random search** evaluates exactly `population × (generations+1)` candidate permutations. Genetic search performs the same number of fitness evaluations *including repeated elites*; it's possible for random search to outperform the GA. We show both, including negative deltas. The fairness claim applies to number of scoring calls, not to total CPU work (GA has extra overhead), unique candidates, or theoretical guarantee.

### Algorithm targets

- **Quicksort / last pivot:** Iterative Lomuto partitioning, last element as pivot. For sorted input, it performs `n(n−1)/2` element comparisons.
- **Quicksort / median of three:** Median of first, middle, last chosen as pivot, then Lomuto partitioning. Count all median-selection comparisons.
- **Insertion sort:** Count each comparison of an earlier element with the insertion key. Worst-case reverse order gives `n(n−1)/2` comparisons.
- **Merge sort:** Count comparisons made during merging, excluding bounds checks. Different permutations often produce similar work; this exposes algorithmic robustness.

The comparison counts are **implementation-specific**. They do not directly predict real execution time, cache misses, or memory overhead, and do not prove global worst-case optimality. Bounded input sizes keep the demo responsive.

### Complexity

Each evaluation runs a full algorithm. Quicksort and insertion-sort evaluations can be `O(n²)` worst case; merge sort is `O(n log n)`. Per experiment there are `P(G+1)` evaluations per arm, plus crossover, selection, mutation, and report generation. `P` is population, `G` generations, and `n` input size.

## Why Pyodide?

Pyodide runs CPython compiled to WebAssembly. A Web Worker downloads the runtime, loads the exact Python `algohunter/core.py` file, then calls the `run_experiment_json()` function. No Python algorithm is reimplemented in JavaScript. Static GitHub Pages can serve the browser demo; the first visit needs an Internet connection to fetch Pyodide from the CDN. All experiments are local to the visitor's device, with no paid API or backend.
