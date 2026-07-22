# Project Memory & Progress: WASM Morph Swap

## Overview
C++/WASM accelerated DOM tree diffing module for htmx `hx-swap="morph"`.

## Location & Architecture
- **C++ Source**: `wasm-morph/morph.cpp`
- **JS Shim**: `wasm-morph/morph-shim.js`
- **Emscripten Build**: `wasm-morph/build.cmd` (Windows) / `build.sh` (POSIX)
- **Local Emscripten SDK**: `emsdk/`
- **Tests**: `test/wasm-morph/` (`wire_format_test.mjs`, `parity.js`, `fallback.js`, `perf.js`)

## Current Progress & Status
- [x] Emscripten SDK configured and activated (`emsdk/`).
- [x] `wasm-morph/` directory scaffolded with build scripts.
- [x] Wire format implemented (`encodeTree` in JS, flat buffer decode in C++).
- [x] Morph tree diff algorithm implemented in C++ (`compute_diff`).
- [x] DOM patch applier implemented in JS (`applyPatches`).
- [x] Fallback to pure-JS morph implemented on WASM load/runtime failure.
- [x] C++ performance optimized (`std::string_view` + `emplace_back`).
- [x] All parity, wire format, fallback, and core htmx unit tests passing (100% code coverage).

## Performance Gains
- **Baseline WASM diff**: ~26.92ms (1000 nodes)
- **Optimized (`emplace_back` + `std::string_view`)**:
  - **1000 nodes**: **6.93ms** (**3.88x faster / 74% reduction**)
  - **3000 nodes**: **18.34ms**

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
