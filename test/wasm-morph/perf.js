import { morph } from '../../wasm-morph/morph-shim.js';

function generateLargeTree(count) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push({
      nodeType: 1,
      tagName: "LI",
      attributes: [{ name: "id", value: `item-${i}` }, { name: "class", value: `cls-${i}` }],
      firstChild: { nodeType: 3, tagName: "#TEXT", nodeValue: `Item ${i} text`, firstChild: null, nextSibling: null },
      nextSibling: null
    });
  }

  for (let i = 0; i < children.length - 1; i++) {
    children[i].nextSibling = children[i + 1];
  }

  return {
    nodeType: 1,
    tagName: "UL",
    attributes: [{ name: "id", value: "list" }],
    firstChild: children[0],
    nextSibling: null,
    getAttribute(k) { return "list"; },
    setAttribute() {},
    removeAttribute() {}
  };
}

async function runBenchmark() {
  const nodeCounts = [1000, 3000];

  // Warmup WASM module
  await morph(generateLargeTree(10), generateLargeTree(10));

  for (const treeSize of nodeCounts) {
    const iterations = 10;
    let totalTime = 0;

    for (let i = 0; i < iterations; i++) {
      const oldTree = generateLargeTree(treeSize);
      const newTree = generateLargeTree(treeSize);
      const start = performance.now();
      await morph(oldTree, newTree);
      totalTime += (performance.now() - start);
    }

    const avgTime = (totalTime / iterations).toFixed(2);
    console.log(`WASM Morph avg time (${treeSize} nodes, ${iterations} runs): ${avgTime}ms`);
  }
}

runBenchmark().catch(err => {
  console.error("Perf benchmark failed:", err);
  process.exit(1);
});
