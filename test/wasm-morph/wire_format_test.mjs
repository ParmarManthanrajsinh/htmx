import assert from 'assert';
import { encodeTree, testRoundtrip } from '../../wasm-morph/morph-shim.js';

// Mock DOM node for testing encodeTree and C++ roundtrip
function createMockElement(tagName, attrs = {}, children = []) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    firstChild: null,
    nextSibling: null
  };

  let prev = null;
  for (const child of children) {
    if (!node.firstChild) node.firstChild = child;
    if (prev) prev.nextSibling = child;
    prev = child;
  }
  return node;
}

function createMockTextNode(text) {
  return {
    nodeType: 3,
    tagName: "#TEXT",
    nodeValue: text,
    firstChild: null,
    nextSibling: null
  };
}

async function runTest() {
  const mockDom = createMockElement("div", { id: "main", class: "container" }, [
    createMockElement("h1", {}, [createMockTextNode("Hello WASM")]),
    createMockElement("p", { class: "text" }, [createMockTextNode("Morph test")])
  ]);

  const originalEncoded = encodeTree(mockDom);
  const roundtripResult = await testRoundtrip(mockDom);

  assert.deepStrictEqual(roundtripResult.nodes, originalEncoded.nodes, "Nodes match");
  assert.deepStrictEqual(roundtripResult.attrs, originalEncoded.attrs, "Attrs match");
  assert.deepStrictEqual(roundtripResult.strings, originalEncoded.strings, "Strings match");

  console.log("Wire format roundtrip test passed!");
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
