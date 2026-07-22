# Project Memory & Progress: WASM Morph Swap (Research Prototype)

## Overview
Standalone research prototype / proof-of-concept for C++/WASM-accelerated DOM tree diffing module targeting `idiomorph` DOM morphing semantics.

## Location & Architecture
- **C++ Source**: `wasm-morph/morph.cpp` (Pointer-based bulk memory decoding, keyed + positional child diffing)
- **JS Shim**: `wasm-morph/morph-shim.js` (Bulk typed array heap encoding, DOM patch applier, graceful JS fallback)
- **Emscripten Build**: `wasm-morph/build.cmd` (Windows) / `build.sh` (POSIX)
- **Local Emscripten SDK**: `emsdk/`
- **Tests**: `test/wasm-morph/` (`parity.js`, `fallback.js`, `perf.js`)

## Current Progress & Status
- [x] Emscripten SDK configured and activated (`emsdk/`).
- [x] `wasm-morph/` standalone module scaffolded with target scope statement in `README.md`.
- [x] Single production export `compute_morph_patch` operating on raw pointer/length buffers.
- [x] O(1) boundary transfer: JS encodes typed array heap buffers (`HEAPU8.set`), C++ decodes directly without per-field embind calls.
- [x] Keyed child diffing implemented in C++ (preserves live DOM element reference identity across reorders).
- [x] Full patch handling (`SetAttr`, `RemoveAttr`, `UpdateText`, `MoveNode`, `InsertNode`, `RemoveNode`) in `applyPatches`.
- [x] Fallback test suite (`fallback.js`) verifies graceful pure-JS degradation when WASM init or runtime fails.
- [x] Benchmark suite (`perf.js`) updated with pure-JS baseline across small (15), medium (250), and large (3000) node trees.

## Benchmark Results: Pure-JS Baseline vs WASM Morph

| Shape | Node Count | JS Median | WASM Median | Speedup Ratio | JS p95 | WASM p95 |
|---|---|---|---|---|---|---|
| keyed | 15 (small) | 0.03ms | 0.13ms | 0.22x | 0.13ms | 0.38ms |
| unkeyed | 15 (small) | 0.02ms | 0.09ms | 0.22x | 0.06ms | 0.31ms |
| reorder | 15 (small) | 0.01ms | 0.07ms | 0.11x | 0.01ms | 0.21ms |
| keyed | 250 (medium) | 0.13ms | 0.91ms | 0.15x | 0.42ms | 1.40ms |
| unkeyed | 250 (medium) | 0.06ms | 0.74ms | 0.08x | 0.30ms | 1.16ms |
| reorder | 250 (medium) | 0.07ms | 0.84ms | 0.08x | 0.17ms | 1.43ms |
| keyed | 3000 (large) | 1.93ms | 17.07ms | 0.11x | 2.59ms | 18.71ms |
| unkeyed | 3000 (large) | 1.80ms | 13.79ms | 0.13x | 2.40ms | 14.58ms |
| reorder | 3000 (large) | 1.92ms | 17.19ms | 0.11x | 2.55ms | 18.63ms |

*Note: In V8 JS runtime, pure-JS in-memory tree diffing benefits from JIT optimizations and avoids WASM heap serialization / JS<->WASM boundary overheads.*

## Build & Benchmark Commands
```cmd
:: Rebuild WASM module
.\wasm-morph\build.cmd

:: Run benchmark
node test/wasm-morph/perf.js

:: Run unit tests
node test/wasm-morph/parity.js
node test/wasm-morph/fallback.js
npm test
```
