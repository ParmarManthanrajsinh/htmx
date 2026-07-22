# WASM-Accelerated Morph Swap for htmx

Optional, drop-in performance acceleration for `hx-swap="morph"`.

## Architecture
- `morph.cpp`: C++ diffing implementation.
- `morph-shim.js`: JS wrapper handling DOM serialization, lazy-loading, and fallback.

## Build
```bash
bash wasm-morph/build.sh
```
