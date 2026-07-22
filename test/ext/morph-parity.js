import assert from 'assert';
import { IdiomorphFast } from '../../ext/idiomorph-fast.js';

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
    ownerDocument: {
      createElement(tag) { return createMockElement(tag); },
      createTextNode(txt) { return createMockTextNode(txt); },
      createComment(txt) { return { nodeType: 8, tagName: "#COMMENT", nodeValue: txt }; }
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
  // Test 1: Basic attribute and text update
  const oldEl = createMockElement("div", { id: "box", class: "old" }, [
    createMockElement("p", {}, [createMockTextNode("Old text")])
  ]);

  const newEl = createMockElement("div", { id: "box", class: "new", title: "hover" }, [
    createMockElement("p", {}, [createMockTextNode("New text")])
  ]);

  IdiomorphFast.morph(oldEl, newEl);

  assert.strictEqual(oldEl.getAttribute("class"), "new");
  assert.strictEqual(oldEl.getAttribute("title"), "hover");
  assert.strictEqual(oldEl.firstChild.firstChild.nodeValue, "New text");

  // Test 2: Keyed child reordering preserves DOM object identity
  const childA = createMockElement("li", { id: "a" }, [createMockTextNode("Item A")]);
  const childB = createMockElement("li", { id: "b" }, [createMockTextNode("Item B")]);
  const childC = createMockElement("li", { id: "c" }, [createMockTextNode("Item C")]);

  const oldList = createMockElement("ul", { id: "list" }, [childA, childB, childC]);

  const newList = createMockElement("ul", { id: "list" }, [
    createMockElement("li", { id: "c" }, [createMockTextNode("Item C")]),
    createMockElement("li", { id: "a" }, [createMockTextNode("Item A")]),
    createMockElement("li", { id: "b" }, [createMockTextNode("Item B")])
  ]);

  IdiomorphFast.morph(oldList, newList);

  // Assert reordered order is c, a, b
  const first = oldList.firstChild;
  const second = first ? first.nextSibling : null;
  const third = second ? second.nextSibling : null;

  assert.strictEqual(first.getAttribute("id"), "c");
  assert.strictEqual(second.getAttribute("id"), "a");
  assert.strictEqual(third.getAttribute("id"), "b");

  // Assert node object identity was preserved!
  assert.strictEqual(second, childA, "Original element reference for id='a' preserved");
  assert.strictEqual(third, childB, "Original element reference for id='b' preserved");
  assert.strictEqual(first, childC, "Original element reference for id='c' preserved");

  // Test 3: List growth
  const growOld = createMockElement("div", { id: "container" }, [
    createMockElement("span", { id: "s1" }, [createMockTextNode("First")])
  ]);
  const growNew = createMockElement("div", { id: "container" }, [
    createMockElement("span", { id: "s1" }, [createMockTextNode("First")]),
    createMockElement("span", { id: "s2" }, [createMockTextNode("Second")])
  ]);

  IdiomorphFast.morph(growOld, growNew);
  assert.strictEqual(growOld.firstChild.nextSibling.getAttribute("id"), "s2");

  console.log("IdiomorphFast unit & parity tests passed!");
}

testParity().catch(err => {
  console.error("Parity test failed:", err);
  process.exit(1);
});
