import assert from 'assert';
import { morph } from '../../wasm-morph/morph-shim.js';

function createMockElement(tagName, attrs = {}, children = []) {
  const node = {
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
    parentNode: null,
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
    }
  };

  let prev = null;
  for (const child of children) {
    child.parentNode = node;
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
    nextSibling: null,
    parentNode: null
  };
}

async function testParity() {
  const oldEl = createMockElement("div", { id: "box", class: "old" }, [
    createMockElement("p", {}, [createMockTextNode("Old text")])
  ]);

  const newEl = createMockElement("div", { id: "box", class: "new", title: "hover" }, [
    createMockElement("p", {}, [createMockTextNode("New text")])
  ]);

  await morph(oldEl, newEl);

  assert.strictEqual(oldEl.getAttribute("class"), "new");
  assert.strictEqual(oldEl.getAttribute("title"), "hover");
  assert.strictEqual(oldEl.firstChild.firstChild.nodeValue, "New text");

  console.log("Parity test passed!");
}

testParity().catch(err => {
  console.error("Parity test failed:", err);
  process.exit(1);
});
