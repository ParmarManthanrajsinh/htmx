# idiomorph-fast

`idiomorph-fast` is a high-performance, pure-JavaScript DOM morphing extension for htmx, designed as a faster drop-in alternative to standard `idiomorph`.

## Scope & Limitations

This extension trades broad feature completeness for extreme speed on the most common use cases. 

**What it does:**
- High-speed keyed list reordering within the same parent node.
- O(1) direct child ID set indexing to eliminate $O(N^2)$ lookups during morphing.
- Fallback positional matching for unkeyed nodes.
- Full attribute diffing and syncing.

**What it does NOT do:**
- **Cross-parent keyed node relocation**: Standard idiomorph allows a keyed node to move from one parent container to a completely different one (e.g. from `<ul id="a">` to `<ul id="b">`) by maintaining a global `persistentIds` set and performing full tree searches. `idiomorph-fast` explicitly skips this to avoid the overhead of full-tree traversal. Keyed nodes will only match if they share the same direct parent node.

## Real-DOM Verification

The test suite (`test/ext/morph-parity.js`) has been upgraded to run against a real `jsdom` document. It explicitly verifies that:
1. All DOM manipulations use spec-compliant `insertBefore`, `appendChild`, and `removeChild` APIs (no manual assignment to `.parentNode` or `.nextSibling`).
2. Live DOM object references are strictly preserved across complex reordering, matching the behavioral contract of `idiomorph`.

## Performance Benchmarks

Benchmarks are run against genuine `jsdom` nodes (not mocked object graphs) and compared to the official upstream `idiomorph` (v0.1.0). While real DOM manipulation (`insertBefore`/`appendChild`) has inherent browser costs that narrow the gap compared to mock objects, the speedups remain substantial—especially for large lists and reordering tasks.

*(Ran via `node test/ext/morph-perf.js`)*

| Shape | Node Count | Upstream Median | IdiomorphFast Median | **Speedup** |
|---|---|---|---|---|
| keyed | 15 (small) | 0.87ms | 0.25ms | **3.45x** |
| unkeyed | 15 (small) | 0.69ms | 0.14ms | **4.88x** |
| reorder | 15 (small) | 1.39ms | 0.25ms | **5.60x** |
| keyed | 300 (medium) | 6.44ms | 3.28ms | **1.96x** |
| unkeyed | 300 (medium) | 17.04ms | 2.90ms | **5.87x** |
| reorder | 300 (medium) | 59.13ms | 7.48ms | **7.90x** |
| keyed | 1000 (large) | 19.89ms | 13.09ms | **1.52x** |
| unkeyed | 1000 (large) | 152.51ms | 12.17ms | **12.53x** |
| reorder | 1000 (large) | 637.50ms | 55.16ms | **11.56x** |
