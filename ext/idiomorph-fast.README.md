# idiomorph-fast

`idiomorph-fast` is a high-performance, pure-JavaScript DOM morphing extension for htmx, designed as a faster drop-in alternative to standard `idiomorph`.

## Scope & Capabilities

**Features:**
- **HTML String Input**: Accepts raw HTML strings as `newContent` (the standard htmx calling convention), parsing via `<template>` for correct handling of partial HTML fragments.
- **Cross-Parent Persistent ID Relocation**: Nodes with matching unique `id`s are preserved and relocated anywhere across the DOM tree while maintaining live element object identity.
- **O(1) Direct Child Map Indexing**: Fast-path local child lookup to eliminate O(N²) scan overhead during morphing.
- **Positional & Text Node Matching**: Fallback positional matching for unkeyed nodes.
- **Attribute Diffing**: Direct attribute diffing with zero GC allocation overhead.

**Limitations:**
- Does not sync live `.value`/`.checked`/`.selected` DOM properties on form elements the way upstream idiomorph's `syncInputValue` does — only HTML attributes are diffed. Form elements with user-modified live state may not reflect server-sent changes correctly.

## Real-DOM Verification

The test suite (`test/ext/morph-parity.js`) runs against a real `jsdom` document and verifies:
1. Standard DOM `insertBefore`, `appendChild`, and `removeChild` operations (no illegal read-only property mutations).
2. Cross-parent node relocation preserving exact live object identity (`elementA === elementB`).

## Performance Benchmarks

Benchmarks are run against genuine `jsdom` nodes (not mocked object graphs) and compared to official upstream `idiomorph` (v0.1.0).

*(Ran via `node test/ext/morph-perf.js`)*

| Shape | Node Count | Upstream Median | IdiomorphFast Median | **Speedup** |
|---|---|---|---|---|
| keyed | 15 (small) | 0.82ms | 0.38ms | **2.17x** |
| unkeyed | 15 (small) | 0.58ms | 0.20ms | **2.85x** |
| reorder | 15 (small) | 1.36ms | 0.31ms | **4.40x** |
| keyed | 300 (medium) | 5.60ms | 4.09ms | **1.37x** |
| unkeyed | 300 (medium) | 17.05ms | 4.22ms | **4.04x** |
| reorder | 300 (medium) | 59.77ms | 9.20ms | **6.49x** |
| keyed | 1000 (large) | 20.09ms | 16.25ms | **1.24x** |
| unkeyed | 1000 (large) | 166.47ms | 15.25ms | **10.92x** |
| reorder | 1000 (large) | 638.83ms | 73.80ms | **8.66x** |
