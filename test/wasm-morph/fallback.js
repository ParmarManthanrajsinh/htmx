import assert from 'assert';
import { morph } from '../../wasm-morph/morph-shim.js';

function createMockElement(tagName, attrs = {}) {
  return {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
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
    firstChild: null,
    nextSibling: null,
    parentNode: null
  };
}

async function testFallbackInitFailure() {
  let fallbackCalled = false;
  const dummyFallback = (oldEl, newEl) => {
    fallbackCalled = true;
    oldEl.setAttribute("class", "fallback-applied");
  };

  const badFallback = (oldEl, newEl) => {
    fallbackCalled = true;
    if (oldEl && oldEl.setAttribute) {
      oldEl.setAttribute("class", "fallback-runtime-error");
    }
  };

  // 1. Force WASM failure mode by passing invalid DOM elements causing runtime encoding error
  await morph(null, null, badFallback);
  assert.strictEqual(fallbackCalled, true, "Fallback function should be called when WASM/encoding fails");

  // 2. Validate fallback element mutation
  const oldEl = createMockElement("div", { class: "old" });
  const newEl = createMockElement("div", { class: "new" });
  fallbackCalled = false;

  const simulatedFail = (oldEl, newEl) => {
    fallbackCalled = true;
    oldEl.setAttribute("class", "fallback-simulated");
  };

  // Pass an invalid object to trigger encoding catch -> fallback
  await morph(oldEl, null, simulatedFail);
  assert.strictEqual(fallbackCalled, true, "Fallback triggered on invalid tree input");
  assert.strictEqual(oldEl.getAttribute("class"), "fallback-simulated", "Fallback result reflected on oldEl");

  console.log("Fallback test passed!");
}

testFallbackInitFailure().catch(err => {
  console.error("Fallback test failed:", err);
  process.exit(1);
});
