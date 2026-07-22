# WASM-Accelerated Morph Swap for htmx (Research Prototype)

> **Target Scope & Integration Status**:
> This module is a **standalone research prototype / proof-of-concept** for WASM-accelerated DOM tree diffing, targeting `idiomorph` morphing semantics (`Idiomorph.morph()`).
> It is **not** integrated into `bigskysoftware/htmx` core or `hx-swap="morph"` dispatch by default.

## Architecture
- `morph.cpp`: C++ diffing algorithm (keyed matching, flat binary buffer decoder, O(1) boundary transfer).
- `morph-shim.js`: JS encoder, typed array heap serializer, DOM patch applier, lazy WASM loader, and graceful pure-JS fallback.

## Build
```cmd
:: Windows
.\wasm-morph\build.cmd

:: POSIX
./wasm-morph/build.sh
```
