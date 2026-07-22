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

export function encodeTreeToHeap(rootEl, mod) {
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

  const encoder = new TextEncoder();
  const stringRecords = [];
  let totalStringBytes = 0;
  const stringBuffers = [];

  for (let i = 0; i < strings.length; i++) {
    const bytes = encoder.encode(strings[i]);
    stringRecords.push(totalStringBytes, bytes.length);
    stringBuffers.push(bytes);
    totalStringBytes += bytes.length;
  }

  const nodesCount = nodes.length / 5;
  const attrsCount = attrs.length / 2;
  const stringsCount = strings.length;

  const headerByteLen = 16;
  const nodesByteLen = nodes.length * 4;
  const attrsByteLen = attrs.length * 4;
  const stringRecsByteLen = stringRecords.length * 4;

  const totalByteLen = headerByteLen + nodesByteLen + attrsByteLen + stringRecsByteLen + totalStringBytes;
  const paddedByteLen = (totalByteLen + 3) & ~3;

  const buffer = new ArrayBuffer(paddedByteLen);
  const u32View = new Uint32Array(buffer);
  const i32View = new Int32Array(buffer);
  const u8View = new Uint8Array(buffer);

  // Header
  u32View[0] = nodesCount;
  u32View[1] = attrsCount;
  u32View[2] = stringsCount;
  u32View[3] = totalStringBytes;

  // Nodes
  for (let i = 0; i < nodes.length; i++) {
    i32View[4 + i] = nodes[i];
  }

  // Attrs
  const attrsStartU32 = 4 + nodes.length;
  for (let i = 0; i < attrs.length; i++) {
    u32View[attrsStartU32 + i] = attrs[i];
  }

  // String Records
  const stringRecsStartU32 = attrsStartU32 + attrs.length;
  for (let i = 0; i < stringRecords.length; i++) {
    u32View[stringRecsStartU32 + i] = stringRecords[i];
  }

  // String Bytes
  let strBytesStartU8 = (stringRecsStartU32 + stringRecords.length) * 4;
  for (let i = 0; i < stringBuffers.length; i++) {
    u8View.set(stringBuffers[i], strBytesStartU8);
    strBytesStartU8 += stringBuffers[i].length;
  }

  // Allocate WASM Heap buffer
  const ptr = mod._malloc(paddedByteLen);
  mod.HEAPU8.set(u8View, ptr);

  return {
    ptr,
    len: paddedByteLen,
    raw: {
      nodes,
      attrs,
      strings
    }
  };
}

export function buildDOMSubtree(newTreeRaw, nodeIdx, doc = document) {
  const { nodes, attrs, strings } = newTreeRaw;
  const tagId = nodes[nodeIdx * 5];
  const attrsOffset = nodes[nodeIdx * 5 + 1];
  const attrsCount = nodes[nodeIdx * 5 + 2];
  const firstChild = nodes[nodeIdx * 5 + 3];

  const tagName = strings[tagId];
  let el;

  if (tagName === "#text") {
    let textVal = "";
    if (attrsCount > 0) {
      textVal = strings[attrs[attrsOffset * 2 + 1]] || "";
    }
    return doc.createTextNode(textVal);
  } else if (tagName === "#comment") {
    return doc.createComment("");
  } else {
    el = doc.createElement(tagName);
    for (let i = 0; i < attrsCount; i++) {
      const key = strings[attrs[(attrsOffset + i) * 2]];
      const val = strings[attrs[(attrsOffset + i) * 2 + 1]];
      el.setAttribute(key, val);
    }
    for (let childIdx = firstChild; childIdx !== -1; childIdx = nodes[childIdx * 5 + 4]) {
      el.appendChild(buildDOMSubtree(newTreeRaw, childIdx, doc));
    }
    return el;
  }
}

export function applyPatches(rootEl, patches, newTreeRaw) {
  const nodeList = [];
  function mapNodes(node) {
    nodeList.push(node);
    for (let c = node.firstChild; c; c = c.nextSibling) {
      mapNodes(c);
    }
  }
  mapNodes(rootEl);

  const doc = rootEl.ownerDocument || document;

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const targetNode = nodeList[patch.target_idx];

    switch (patch.kind) {
      case 0: // SetAttr
        if (targetNode && targetNode.nodeType === 1) {
          const key = newTreeRaw.strings[patch.key_id];
          const val = newTreeRaw.strings[patch.val_id];
          targetNode.setAttribute(key, val);
        }
        break;
      case 1: // RemoveAttr
        if (targetNode && targetNode.nodeType === 1) {
          const key = newTreeRaw.strings[patch.key_id];
          targetNode.removeAttribute(key);
        }
        break;
      case 2: // UpdateText
        if (targetNode && targetNode.nodeType === 3) {
          targetNode.nodeValue = newTreeRaw.strings[patch.val_id];
        }
        break;
      case 3: { // MoveNode
        const parentNode = nodeList[patch.parent_idx];
        const siblingNode = patch.sibling_idx >= 0 ? nodeList[patch.sibling_idx] : null;
        if (targetNode && parentNode) {
          if (siblingNode && siblingNode.parentNode === parentNode) {
            parentNode.insertBefore(targetNode, siblingNode);
          } else {
            parentNode.appendChild(targetNode);
          }
        }
        break;
      }
      case 4: { // InsertNode
        const parentNode = nodeList[patch.parent_idx] || rootEl;
        const siblingNode = patch.sibling_idx >= 0 ? nodeList[patch.sibling_idx] : null;
        const newDOMNode = buildDOMSubtree(newTreeRaw, patch.target_idx, doc);
        if (siblingNode && siblingNode.parentNode === parentNode) {
          parentNode.insertBefore(newDOMNode, siblingNode);
        } else {
          parentNode.appendChild(newDOMNode);
        }
        break;
      }
      case 5: // RemoveNode
        if (targetNode && targetNode.parentNode) {
          targetNode.parentNode.removeChild(targetNode);
        }
        break;
    }
  }
}

export async function morph(oldEl, newEl, fallbackJsMorph) {
  let mod;
  try {
    mod = await initWasmMorph();
    if (!mod || initFailed) {
      if (typeof fallbackJsMorph === 'function') {
        return fallbackJsMorph(oldEl, newEl);
      }
      return;
    }

    const encodedOld = encodeTreeToHeap(oldEl, mod);
    const encodedNew = encodeTreeToHeap(newEl, mod);

    const patchRes = mod.compute_morph_patch(
      encodedOld.ptr, encodedOld.len,
      encodedNew.ptr, encodedNew.len
    );

    const patchPtr = patchRes.ptr;
    const patchCount = patchRes.count;
    const patches = [];

    if (patchPtr && patchCount > 0) {
      const heapBuf = mod.HEAPU8.buffer;
      const patchU32View = new Uint32Array(heapBuf, patchPtr, patchCount * 6);
      const patchI32View = new Int32Array(heapBuf, patchPtr, patchCount * 6);
      for (let i = 0; i < patchCount; i++) {
        const offset = i * 6;
        patches.push({
          kind: patchU32View[offset],
          target_idx: patchU32View[offset + 1],
          parent_idx: patchU32View[offset + 2],
          sibling_idx: patchI32View[offset + 3],
          key_id: patchU32View[offset + 4],
          val_id: patchU32View[offset + 5]
        });
      }
    }

    mod._free(encodedOld.ptr);
    mod._free(encodedNew.ptr);

    applyPatches(oldEl, patches, encodedNew.raw);
  } catch (err) {
    if (typeof fallbackJsMorph === 'function') {
      return fallbackJsMorph(oldEl, newEl);
    }
  }
}

