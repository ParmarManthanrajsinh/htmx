# idiomorph-fast

`idiomorph-fast` is a high-performance, pure-JavaScript DOM morphing extension for htmx, designed as a faster drop-in alternative to standard `idiomorph`.

It uses an O(1) direct-child ID Map lookup for matching nodes, avoiding the full subtree id-set tree walk that upstream idiomorph performs. This yields significant speedups — especially on large, unkeyed, or reordered content.

## Performance Benchmarks

Benchmarks run in Chrome via `@web/test-runner`, comparing `idiomorph-fast` against upstream `idiomorph` (v0.7.4) on real DOM nodes.

Run: `npx web-test-runner --files test/ext/idiomorph-fast.bench.js`

| Shape | Node Count | Upstream Median | IdiomorphFast Median | **Speedup** | Upstream p95 | Fast p95 |
|---|---|---|---|---|---|---|
| keyed | 15 (small) | 0.10ms | 0.10ms | **1.00x** | 0.20ms | 0.20ms |
| unkeyed | 15 (small) | 0.10ms | 0.10ms | **1.00x** | 0.20ms | 0.10ms |
| reorder | 15 (small) | 0.40ms | 0.10ms | **4.00x** | 0.70ms | 0.10ms |
| keyed | 300 (medium) | 2.90ms | 1.70ms | **1.71x** | 3.30ms | 2.40ms |
| unkeyed | 300 (medium) | 8.50ms | 0.90ms | **9.44x** | 10.10ms | 3.70ms |
| reorder | 300 (medium) | 8.30ms | 1.10ms | **7.55x** | 10.70ms | 6.20ms |
| keyed | 1000 (large) | 6.10ms | 3.40ms | **1.79x** | 8.20ms | 4.20ms |
| unkeyed | 1000 (large) | 84.40ms | 4.00ms | **21.10x** | 86.90ms | 4.90ms |
| reorder | 1000 (large) | 34.30ms | 4.10ms | **8.37x** | 40.90ms | 9.10ms |

### Analysis

- **Small sets (15 nodes):** Equivalent for keyed/unkeyed (sub-millisecond noise floor).
- **Medium sets (300 nodes):** 1.7–9.4x faster. Unkeyed content sees the biggest win because upstream falls back to O(N²) tag+position matching while idiomorph-fast uses positional O(N) matching.
- **Large sets (1000 nodes):** Dramatic wins — up to **21x faster** for unkeyed, **8.4x for reorder**. This is where the O(1) Map lookup vs upstream's subtree id-set traversal makes the most impact.

## Features

- **O(1) Direct Child Map Indexing:** Fast-path local child lookup eliminates O(N²) scan overhead.
- **HTML String Input:** Accepts raw HTML strings, parsing via `<template>` for correct handling of partial HTML fragments.
- **Cross-Parent Persistent ID Relocation:** Nodes with matching unique `id`s are preserved and relocated anywhere across the DOM tree while maintaining live element object identity.
- **Positional & Tag-Name Matching:** Fallback matching for unkeyed nodes.
- **Attribute Diffing:** Direct attribute diffing with zero GC allocation overhead.
- **Form State Sync:** Syncs live `.value`, `.checked`, `.disabled`, `.selected` DOM properties on form elements.
- **Focus Restoration:** Restores focus and cursor position after morph.
- **Callbacks:** Full callback support (`beforeNodeAdded`, `afterNodeAdded`, `beforeNodeMorphed`, `afterNodeMorphed`, `beforeNodeRemoved`, `afterNodeRemoved`, `beforeAttributeUpdated`).

## Usage

```html
<script src="https://unpkg.com/htmx.org@2"></script>
<script src="ext/idiomorph-fast.js"></script>

<button hx-get="/example" hx-swap="morph" hx-ext="morph">
  Morph Me (outerHTML)
</button>

<button hx-get="/example" hx-swap="morph:innerHTML" hx-ext="morph">
  Morph Me (innerHTML)
</button>
```

## Test Suite

Run: `npx web-test-runner --files test/ext/idiomorph-fast.test.js`
