import assert from 'assert';
import { JSDOM } from 'jsdom';
import { IdiomorphFast } from '../../ext/idiomorph-fast.js';

const { document } = new JSDOM().window;

function createTestDOM(html) {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

// Test 1: Attributes sync
{
  const oldNode = createTestDOM(`<div class="a" data-old="1"></div>`);
  const newNode = createTestDOM(`<div class="b" data-new="2"></div>`);
  IdiomorphFast.morph(oldNode, newNode);
  assert.strictEqual(oldNode.getAttribute("class"), "b");
  assert.strictEqual(oldNode.getAttribute("data-new"), "2");
  assert.strictEqual(oldNode.hasAttribute("data-old"), false);
}

// Test 2: Child Reordering (Same Parent Fast Path)
{
  const oldNode = createTestDOM(`
    <ul id="list">
      <li id="A">A</li>
      <li id="B">B</li>
      <li id="C">C</li>
    </ul>
  `);
  
  const originalA = oldNode.children[0];
  const originalB = oldNode.children[1];
  const originalC = oldNode.children[2];

  const newNode = createTestDOM(`
    <ul id="list">
      <li id="C">C</li>
      <li id="A">A</li>
      <li id="B">B</li>
    </ul>
  `);

  IdiomorphFast.morph(oldNode, newNode);

  assert.strictEqual(oldNode.children.length, 3);
  assert.strictEqual(oldNode.children[0], originalC, "Object identity of C preserved");
  assert.strictEqual(oldNode.children[1], originalA, "Object identity of A preserved");
  assert.strictEqual(oldNode.children[2], originalB, "Object identity of B preserved");
}

// Test 3: Growth
{
  const oldNode = createTestDOM(`<div id="container"><span id="1">1</span></div>`);
  const newNode = createTestDOM(`<div id="container"><span id="1">1</span><span id="2">2</span></div>`);
  
  const origSpan1 = oldNode.children[0];
  IdiomorphFast.morph(oldNode, newNode);
  
  assert.strictEqual(oldNode.children.length, 2);
  assert.strictEqual(oldNode.children[0], origSpan1, "Span 1 identity preserved");
  assert.strictEqual(oldNode.children[1].getAttribute("id"), "2");
}

// Test 4: Regression test - 3-item real DOM list reorder without exception
{
  const oldList = createTestDOM(`
    <ul id="test-list">
      <li id="item-a">a</li>
      <li id="item-b">b</li>
      <li id="item-c">c</li>
    </ul>
  `);

  const originalItems = Array.from(oldList.children);

  const newList = createTestDOM(`
    <ul id="test-list">
      <li id="item-b">b</li>
      <li id="item-a">a</li>
    </ul>
  `);

  IdiomorphFast.morph(oldList, newList);
  
  assert.strictEqual(oldList.children.length, 2);
  assert.strictEqual(oldList.children[0], originalItems[1], "b should be first");
  assert.strictEqual(oldList.children[1], originalItems[0], "a should be second");
}

// Test 5: Cross-Parent Persistent ID Node Relocation
{
  const oldNode = createTestDOM(`
    <div id="root">
      <ul id="a"><li id="x">X</li></ul>
      <ul id="b"></ul>
    </div>
  `);
  const originalX = oldNode.querySelector('#x');

  const newNode = createTestDOM(`
    <div id="root">
      <ul id="a"></ul>
      <ul id="b"><li id="x">X</li></ul>
    </div>
  `);

  IdiomorphFast.morph(oldNode, newNode);

  assert.strictEqual(oldNode.querySelector('#b').children[0], originalX,
    "node x moved to new parent, same object identity preserved");
  assert.strictEqual(oldNode.querySelector('#a').children.length, 0);
}

console.log("IdiomorphFast real-DOM unit & parity tests passed!");
