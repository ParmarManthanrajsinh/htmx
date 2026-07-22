import { Idiomorph } from './idiomorph-original.js';
import { IdiomorphFast } from '../../ext/idiomorph-fast.js';

function cloneMockTree(node) {
  if (!node) return null;
  const copy = {
    nodeType: node.nodeType,
    tagName: node.tagName,
    attributes: node.attributes ? node.attributes.map(a => ({ name: a.name, value: a.value })) : [],
    nodeValue: node.nodeValue || "",
    firstChild: null,
    nextSibling: null,
    parentNode: null,
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
    },
    removeChild(child) {
      if (this.firstChild === child) {
        this.firstChild = child.nextSibling;
      } else {
        let curr = this.firstChild;
        while (curr && curr.nextSibling !== child) {
          curr = curr.nextSibling;
        }
        if (curr) curr.nextSibling = child.nextSibling;
      }
      child.parentNode = null;
    },
    insertBefore(newChild, refChild) {
      if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
      }
      newChild.parentNode = this;
      if (!refChild || this.firstChild === refChild) {
        newChild.nextSibling = this.firstChild;
        this.firstChild = newChild;
      } else {
        let curr = this.firstChild;
        while (curr && curr.nextSibling !== refChild) {
          curr = curr.nextSibling;
        }
        if (curr) {
          newChild.nextSibling = curr.nextSibling;
          curr.nextSibling = newChild;
        } else {
          this.appendChild(newChild);
        }
      }
    },
    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      child.nextSibling = null;
      if (!this.firstChild) {
        this.firstChild = child;
      } else {
        let curr = this.firstChild;
        while (curr.nextSibling) {
          curr = curr.nextSibling;
        }
        curr.nextSibling = child;
      }
    }
  };

  let prevChild = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    const childCopy = cloneMockTree(c);
    childCopy.parentNode = copy;
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
      firstChild: { nodeType: 3, tagName: "#TEXT", nodeValue: `Item ${i} text`, firstChild: null, nextSibling: null, parentNode: null },
      nextSibling: null,
      parentNode: null,
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
    children.reverse();
  }

  for (let i = 0; i < children.length - 1; i++) {
    children[i].nextSibling = children[i + 1];
  }

  const root = {
    nodeType: 1,
    tagName: "UL",
    attributes: [{ name: "id", value: "list" }],
    firstChild: children[0],
    nextSibling: null,
    parentNode: null,
    getAttribute(k) { return "list"; },
    setAttribute() {},
    removeAttribute() {},
    removeChild(child) {
      if (this.firstChild === child) {
        this.firstChild = child.nextSibling;
      } else {
        let curr = this.firstChild;
        while (curr && curr.nextSibling !== child) {
          curr = curr.nextSibling;
        }
        if (curr) curr.nextSibling = child.nextSibling;
      }
      child.parentNode = null;
    },
    insertBefore(newChild, refChild) {
      if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
      }
      newChild.parentNode = this;
      if (!refChild || this.firstChild === refChild) {
        newChild.nextSibling = this.firstChild;
        this.firstChild = newChild;
      } else {
        let curr = this.firstChild;
        while (curr && curr.nextSibling !== refChild) {
          curr = curr.nextSibling;
        }
        if (curr) {
          newChild.nextSibling = curr.nextSibling;
          curr.nextSibling = newChild;
        } else {
          this.appendChild(newChild);
        }
      }
    },
    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      child.nextSibling = null;
      if (!this.firstChild) {
        this.firstChild = child;
      } else {
        let curr = this.firstChild;
        while (curr.nextSibling) {
          curr = curr.nextSibling;
        }
        curr.nextSibling = child;
      }
    }
  };

  for (const c of children) c.parentNode = root;

  return root;
}

function calcPercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function runBenchmark() {
  const sizes = [
    { label: "small", count: 15, runs: 30 },
    { label: "medium", count: 300, runs: 20 },
    { label: "large", count: 1000, runs: 10 }
  ];

  const shapes = ["keyed", "unkeyed", "reorder"];
  const warmupRuns = 5;

  console.log("\n### Benchmark Results: Standard Idiomorph vs IdiomorphFast\n");
  console.log("| Shape | Node Count | Standard Median | IdiomorphFast Median | **Speedup** | Standard p95 | Fast p95 |");
  console.log("|---|---|---|---|---|---|---|");

  for (const { label, count, runs: iterations } of sizes) {
    for (const shape of shapes) {
      const oldTree = generateTree("keyed", count);
      const newTree = generateTree(shape, count);

      // 1. Standard Idiomorph Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        Idiomorph.morph(cloneMockTree(oldTree), cloneMockTree(newTree));
      }
      const origTimes = [];
      for (let i = 0; i < iterations; i++) {
        const o = cloneMockTree(oldTree);
        const n = cloneMockTree(newTree);
        const t0 = performance.now();
        Idiomorph.morph(o, n);
        origTimes.push(performance.now() - t0);
      }

      // 2. IdiomorphFast Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        IdiomorphFast.morph(cloneMockTree(oldTree), cloneMockTree(newTree));
      }
      const fastTimes = [];
      for (let i = 0; i < iterations; i++) {
        const o = cloneMockTree(oldTree);
        const n = cloneMockTree(newTree);
        const t0 = performance.now();
        IdiomorphFast.morph(o, n);
        fastTimes.push(performance.now() - t0);
      }

      const origMedian = calcPercentile(origTimes, 50);
      const origP95 = calcPercentile(origTimes, 95);

      const fastMedian = calcPercentile(fastTimes, 50);
      const fastP95 = calcPercentile(fastTimes, 95);

      const speedup = (origMedian / (fastMedian || 0.001)).toFixed(2);

      console.log(
        `| ${shape} | ${count} (${label}) | ${origMedian.toFixed(2)}ms | ${fastMedian.toFixed(2)}ms | **${speedup}x** | ${origP95.toFixed(2)}ms | ${fastP95.toFixed(2)}ms |`
      );
    }
  }
}

runBenchmark().catch(err => {
  console.error("Perf benchmark failed:", err);
  process.exit(1);
});
