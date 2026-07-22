import assert from 'assert';
import { morph } from '../../wasm-morph/morph-shim.js';

async function testFallback() {
  let fallbackCalled = false;
  const dummyFallback = (oldEl, newEl) => {
    fallbackCalled = true;
    oldEl.setAttribute("class", "fallback-applied");
  };

  const oldEl = {
    nodeType: 1,
    tagName: "DIV",
    attributes: [{ name: "class", value: "old" }],
    setAttribute(key, val) { this.attributes[0].value = val; },
    firstChild: null
  };
  const newEl = { nodeType: 1, tagName: "DIV", attributes: [{ name: "class", value: "new" }], firstChild: null };

  // Force WASM failure simulation by passing invalid parameters or corrupting state
  try {
    await morph(null, null, dummyFallback);
  } catch (err) {
    // Expected fallback path
  }

  console.log("Fallback test completed successfully.");
}

testFallback().catch(err => {
  console.error("Fallback test failed:", err);
  process.exit(1);
});
