let wasmModule = null;
let initPromise = null;
let initFailed = false;

export async function initWasmMorph() {
  if (wasmModule) return wasmModule;
  if (initFailed) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const createModule = (await import('./morph_wasm.js')).default;
      wasmModule = await createModule();
      return wasmModule;
    } catch (err) {
      console.warn("htmx: WASM morph module failed to load. Falling back to JS morph.", err);
      initFailed = true;
      return null;
    }
  })();

  return initPromise;
}

export function encodeTree(rootEl) {
  const nodes = [];
  const attrs = [];
  const strings = [];
  const stringMap = new Map();

  function internString(str) {
    if (stringMap.has(str)) return stringMap.get(str);
    const id = strings.length;
    strings.push(str);
    stringMap.set(str, id);
    return id;
  }

  function traverse(node) {
    const nodeIdx = nodes.length / 5;
    nodes.push(0, 0, 0, -1, -1);

    let tagName = "";
    if (node.nodeType === 1) { // ELEMENT_NODE
      tagName = node.tagName.toLowerCase();
    } else if (node.nodeType === 3) { // TEXT_NODE
      tagName = "#text";
    } else if (node.nodeType === 8) { // COMMENT_NODE
      tagName = "#comment";
    }

    const tagId = internString(tagName);
    const attrsOffset = attrs.length / 2;
    let attrsCount = 0;

    if (node.nodeType === 1 && node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        const keyId = internString(attr.name);
        const valId = internString(attr.value);
        attrs.push(keyId, valId);
        attrsCount++;
      }
    } else if (node.nodeType === 3) {
      const textValId = internString(node.nodeValue || "");
      attrs.push(internString("nodeValue"), textValId);
      attrsCount = 1;
    }

    let firstChildIdx = -1;
    let prevChildIdx = -1;

    for (let child = node.firstChild; child; child = child.nextSibling) {
      const childIdx = traverse(child);
      if (firstChildIdx === -1) {
        firstChildIdx = childIdx;
      }
      if (prevChildIdx !== -1) {
        nodes[prevChildIdx * 5 + 4] = childIdx;
      }
      prevChildIdx = childIdx;
    }

    nodes[nodeIdx * 5] = tagId;
    nodes[nodeIdx * 5 + 1] = attrsOffset;
    nodes[nodeIdx * 5 + 2] = attrsCount;
    nodes[nodeIdx * 5 + 3] = firstChildIdx;
    nodes[nodeIdx * 5 + 4] = -1;

    return nodeIdx;
  }

  traverse(rootEl);

  return {
    nodes,
    attrs,
    strings
  };
}

export function applyPatches(rootEl, patches, newStrings) {
  // Map index to node in DOM
  const nodeList = [];
  function mapNodes(node) {
    nodeList.push(node);
    for (let c = node.firstChild; c; c = c.nextSibling) {
      mapNodes(c);
    }
  }
  mapNodes(rootEl);

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const targetNode = nodeList[patch.target_idx];
    if (!targetNode) continue;

    switch (patch.kind) {
      case 0: // SetAttr
        if (targetNode.nodeType === 1) {
          const key = newStrings[patch.key_id];
          const val = newStrings[patch.val_id];
          targetNode.setAttribute(key, val);
        }
        break;
      case 1: // RemoveAttr
        if (targetNode.nodeType === 1) {
          const key = newStrings[patch.key_id];
          targetNode.removeAttribute(key);
        }
        break;
      case 2: // UpdateText
        if (targetNode.nodeType === 3) {
          targetNode.nodeValue = newStrings[patch.val_id];
        }
        break;
      case 5: // RemoveNode
        if (targetNode.parentNode) {
          targetNode.parentNode.removeChild(targetNode);
        }
        break;
    }
  }
}

export async function morph(oldEl, newEl, fallbackJsMorph) {
  const mod = await initWasmMorph();
  if (!mod || initFailed) {
    if (typeof fallbackJsMorph === 'function') {
      return fallbackJsMorph(oldEl, newEl);
    }
    return;
  }

  const encodedOld = encodeTree(oldEl);
  const encodedNew = encodeTree(newEl);
  const patches = mod.compute_diff(encodedOld, encodedNew);
  applyPatches(oldEl, patches, encodedNew.strings);
}

export async function testRoundtrip(rootEl) {
  const mod = await initWasmMorph();
  if (!mod) return null;
  const encoded = encodeTree(rootEl);
  return mod.roundtrip_test(encoded);
}
