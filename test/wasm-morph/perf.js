import { morph as wasmMorph } from '../../wasm-morph/morph-shim.js';

// Pure JS Morph Implementation for Baseline Comparison
function jsMorph(oldEl, newEl) {
  if (!oldEl || !newEl) return;

  // Diff Attributes
  if (oldEl.nodeType === 1 && newEl.nodeType === 1) {
    const oldAttrs = new Map();
    if (oldEl.attributes) {
      for (let i = 0; i < oldEl.attributes.length; i++) {
        oldAttrs.set(oldEl.attributes[i].name, oldEl.attributes[i].value);
      }
    }

    const newAttrs = new Set();
    if (newEl.attributes) {
      for (let i = 0; i < newEl.attributes.length; i++) {
        const attr = newEl.attributes[i];
        newAttrs.add(attr.name);
        if (!oldAttrs.has(attr.name) || oldAttrs.get(attr.name) !== attr.value) {
          if (typeof oldEl.setAttribute === 'function') {
            oldEl.setAttribute(attr.name, attr.value);
          }
        }
      }
    }

    for (const [key] of oldAttrs) {
      if (!newAttrs.has(key)) {
        if (typeof oldEl.removeAttribute === 'function') {
          oldEl.removeAttribute(key);
        }
      }
    }
  } else if (oldEl.nodeType === 3 && newEl.nodeType === 3) {
    if (oldEl.nodeValue !== newEl.nodeValue) {
      oldEl.nodeValue = newEl.nodeValue;
    }
    return;
  }

  // Collect children
  const oldChildren = [];
  for (let c = oldEl.firstChild; c; c = c.nextSibling) oldChildren.push(c);

  const newChildren = [];
  for (let c = newEl.firstChild; c; c = c.nextSibling) newChildren.push(c);

  // Keyed map
  const oldKeyMap = new Map();
  oldChildren.forEach((child, idx) => {
    if (child.getAttribute && child.getAttribute("id")) {
      oldKeyMap.set(child.getAttribute("id"), { child, idx });
    }
  });

  const oldMatched = new Array(oldChildren.length).fill(false);

  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i];
    const newId = newChild.getAttribute ? newChild.getAttribute("id") : null;

    if (newId && oldKeyMap.has(newId)) {
      const { child: oldChild, idx: oldIdx } = oldKeyMap.get(newId);
      oldMatched[oldIdx] = true;
      jsMorph(oldChild, newChild);
    } else if (i < oldChildren.length && !oldMatched[i]) {
      oldMatched[i] = true;
      jsMorph(oldChildren[i], newChild);
    }
  }
}

function cloneMockTree(node) {
  if (!node) return null;
  const copy = {
    nodeType: node.nodeType,
    tagName: node.tagName,
    attributes: node.attributes ? node.attributes.map(a => ({ name: a.name, value: a.value })) : [],
    nodeValue: node.nodeValue || "",
    firstChild: null,
    nextSibling: null,
    getAttribute(key) {
      const a = this.attributes.find(x => x.name === key);
      return a ? a.value : null;
    },
    setAttribute(key, val) {
      const a = this.attributes.find(x => x.name === key);
      if (a) a.value = val;
      else this.attributes.push({ name: key, value: val });
    },
    removeAttribute(key) {
      this.attributes = this.attributes.filter(x => x.name !== key);
    }
  };

  let prevChild = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    const childCopy = cloneMockTree(c);
    if (!copy.firstChild) copy.firstChild = childCopy;
    if (prevChild) prevChild.nextSibling = childCopy;
    prevChild = childCopy;
  }
  return copy;
}

function generateTree(shape, count) {
  const children = [];
  for (let i = 0; i < count; i++) {
    const attrs = [];
    if (shape === "keyed" || shape === "reorder") {
      attrs.push({ name: "id", value: `item-${i}` });
    }
    attrs.push({ name: "class", value: `cls-${i}` });

    children.push({
      nodeType: 1,
      tagName: "LI",
      attributes: attrs,
      firstChild: { nodeType: 3, tagName: "#TEXT", nodeValue: `Item ${i} text`, firstChild: null, nextSibling: null },
      nextSibling: null,
      getAttribute(k) {
        const a = this.attributes.find(x => x.name === k);
        return a ? a.value : null;
      },
      setAttribute(k, v) {
        const a = this.attributes.find(x => x.name === k);
        if (a) a.value = v; else this.attributes.push({ name: k, value: v });
      },
      removeAttribute(k) {
        this.attributes = this.attributes.filter(x => x.name !== k);
      }
    });
  }

  if (shape === "reorder") {
    // Reverse array to simulate reorder
    children.reverse();
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

function calcPercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function runBenchmark() {
  const sizes = [
    { label: "small", count: 15 },
    { label: "medium", count: 250 },
    { label: "large", count: 3000 }
  ];

  const shapes = ["keyed", "unkeyed", "reorder"];
  const warmupRuns = 15;
  const iterations = 100;

  console.log("\n### Benchmark Results: Pure-JS vs WASM Morph\n");
  console.log("| Shape | Node Count | JS Median | WASM Median | Speedup Ratio | JS p95 | WASM p95 |");
  console.log("|---|---|---|---|---|---|---|");

  // Warmup WASM
  const w1 = generateTree("keyed", 10);
  const w2 = generateTree("keyed", 10);
  await wasmMorph(w1, w2);

  for (const { label, count } of sizes) {
    for (const shape of shapes) {
      const oldTree = generateTree("keyed", count);
      const newTree = generateTree(shape, count);

      // JS Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        jsMorph(cloneMockTree(oldTree), cloneMockTree(newTree));
      }
      const jsTimes = [];
      for (let i = 0; i < iterations; i++) {
        const o = cloneMockTree(oldTree);
        const n = cloneMockTree(newTree);
        const t0 = performance.now();
        jsMorph(o, n);
        jsTimes.push(performance.now() - t0);
      }

      // WASM Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        await wasmMorph(cloneMockTree(oldTree), cloneMockTree(newTree));
      }
      const wasmTimes = [];
      for (let i = 0; i < iterations; i++) {
        const o = cloneMockTree(oldTree);
        const n = cloneMockTree(newTree);
        const t0 = performance.now();
        await wasmMorph(o, n);
        wasmTimes.push(performance.now() - t0);
      }

      const jsMedian = calcPercentile(jsTimes, 50);
      const jsP95 = calcPercentile(jsTimes, 95);
      const wasmMedian = calcPercentile(wasmTimes, 50);
      const wasmP95 = calcPercentile(wasmTimes, 95);

      const speedup = (jsMedian / (wasmMedian || 0.001)).toFixed(2);

      console.log(
        `| ${shape} | ${count} (${label}) | ${jsMedian.toFixed(2)}ms | ${wasmMedian.toFixed(2)}ms | ${speedup}x | ${jsP95.toFixed(2)}ms | ${wasmP95.toFixed(2)}ms |`
      );
    }
  }
}

runBenchmark().catch(err => {
  console.error("Perf benchmark failed:", err);
  process.exit(1);
});
