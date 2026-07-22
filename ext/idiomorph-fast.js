// High-Performance Pure-JS Idiomorph DOM Morphing Extension for htmx
// Fast O(1) direct child ID set matching without WASM/binary overhead

export var IdiomorphFast = (function () {
  "use strict";

  const noOp = () => {};
  const defaults = {
    morphStyle: "outerHTML",
    callbacks: {
      beforeNodeAdded: noOp,
      afterNodeAdded: noOp,
      beforeNodeMorphed: noOp,
      afterNodeMorphed: noOp,
      beforeNodeRemoved: noOp,
      afterNodeRemoved: noOp,
    },
  };

  function normalizeParent(elt) {
    if (elt == null) return null;
    if (elt.nodeType === 1 || elt.nodeType === 11 || elt.nodeType === 9) return elt;
    return null;
  }

  function collectElementsWithId(root, map) {
    if (!root) return;
    if (root.nodeType === 1 && root.getAttribute) {
      const id = root.getAttribute("id");
      if (id) {
        const existing = map.get(id);
        if (existing) {
          existing.count++;
        } else {
          map.set(id, { count: 1, tagName: root.tagName });
        }
      }
    }
    if (root.querySelectorAll) {
      const elts = root.querySelectorAll("[id]");
      for (let i = 0; i < elts.length; i++) {
        const elt = elts[i];
        const id = elt.getAttribute("id");
        if (id) {
          const existing = map.get(id);
          if (existing) {
            existing.count++;
          } else {
            map.set(id, { count: 1, tagName: elt.tagName });
          }
        }
      }
    } else {
      for (let c = root.firstChild; c; c = c.nextSibling) {
        collectElementsWithId(c, map);
      }
    }
  }

  function createPersistentIds(oldNode, newNode) {
    const oldMap = new Map();
    const newMap = new Map();
    collectElementsWithId(oldNode, oldMap);
    collectElementsWithId(newNode, newMap);

    const persistentIds = new Set();
    for (const [id, oldInfo] of oldMap.entries()) {
      if (oldInfo.count === 1) {
        const newInfo = newMap.get(id);
        if (newInfo && newInfo.count === 1 && newInfo.tagName === oldInfo.tagName) {
          persistentIds.add(id);
        }
      }
    }
    return persistentIds;
  }

  function findElementById(root, id) {
    if (root.getAttribute && root.getAttribute("id") === id) return root;
    if (root.querySelector) {
      try {
        const found = root.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');
        if (found) return found;
      } catch (e) {}
    }
    for (let c = root.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) {
        const found = findElementById(c, id);
        if (found) return found;
      }
    }
    return null;
  }

  function createMorphContext(oldNode, newContent, config) {
    const mergedConfig = Object.assign({}, defaults, config);
    return {
      target: oldNode,
      newContent,
      config: mergedConfig,
      persistentIds: createPersistentIds(oldNode, newContent),
      callbacks: mergedConfig.callbacks
    };
  }

  function morph(oldNode, newContent, config = {}) {
    oldNode = normalizeParent(oldNode);
    const newNode = normalizeParent(newContent);
    if (!oldNode || !newNode) return;
    const ctx = createMorphContext(oldNode, newNode, config);
    if (ctx.config.morphStyle === "innerHTML") {
      morphChildren(ctx, oldNode, newNode);
    } else {
      morphNode(oldNode, newNode, ctx);
    }
    return oldNode;
  }

  function morphChildren(ctx, oldParent, newParent, insertionPoint = null, endPoint = null) {
    insertionPoint = insertionPoint || oldParent.firstChild;

    // Fast child indexing: O(1) map lookup for direct old children by id
    let oldDirectChildIdMap = null;
    for (let c = insertionPoint; c && c !== endPoint; c = c.nextSibling) {
      if (c.nodeType === 1 && c.getAttribute) {
        const id = c.getAttribute("id");
        if (id) {
          if (!oldDirectChildIdMap) oldDirectChildIdMap = new Map();
          oldDirectChildIdMap.set(id, c);
        }
      }
    }

    for (let newChild = newParent.firstChild; newChild; newChild = newChild.nextSibling) {
      let matchedNode = null;

      // 1. O(1) Direct ID lookup
      if (oldDirectChildIdMap && newChild.nodeType === 1 && newChild.getAttribute) {
        const newId = newChild.getAttribute("id");
        if (newId && oldDirectChildIdMap.has(newId)) {
          matchedNode = oldDirectChildIdMap.get(newId);
          oldDirectChildIdMap.delete(newId);
        }
      }

      // 2. Positional soft match at insertion point if no direct ID match
      if (!matchedNode && insertionPoint && insertionPoint !== endPoint) {
        if (insertionPoint.nodeType === newChild.nodeType && insertionPoint.tagName === newChild.tagName) {
          const oldId = insertionPoint.getAttribute ? insertionPoint.getAttribute("id") : null;
          const newId = newChild.getAttribute ? newChild.getAttribute("id") : null;
          if (!oldId || oldId === newId) {
            matchedNode = insertionPoint;
          }
        }
      }

      // 3. Tree-wide persistent ID lookup
      if (!matchedNode && newChild.nodeType === 1 && newChild.getAttribute) {
        const newId = newChild.getAttribute("id");
        if (newId && ctx.persistentIds.has(newId)) {
          const found = findElementById(ctx.target, newId);
          if (found && found.tagName === newChild.tagName) {
            matchedNode = found;
          }
        }
      }

      if (matchedNode) {
        if (matchedNode !== insertionPoint) {
          moveBefore(oldParent, matchedNode, insertionPoint);
        }
        morphNode(matchedNode, newChild, ctx);
        insertionPoint = matchedNode.nextSibling;
        continue;
      }

      // 4. Create / Clone new node
      const insertedNode = createNode(oldParent, newChild, insertionPoint, ctx);
      if (insertedNode) {
        insertionPoint = insertedNode.nextSibling;
      }
    }

    while (insertionPoint && insertionPoint !== endPoint) {
      const tempNode = insertionPoint;
      insertionPoint = insertionPoint.nextSibling;
      if (tempNode.nodeType === 1 && tempNode.getAttribute) {
        const id = tempNode.getAttribute("id");
        if (id && ctx.persistentIds.has(id)) {
          continue;
        }
      }
      removeNode(ctx, tempNode);
    }
  }

  function createNode(oldParent, newChild, insertionPoint, ctx) {
    if (ctx.callbacks.beforeNodeAdded(newChild) === false) return null;
    const doc = oldParent.ownerDocument || (typeof document !== 'undefined' ? document : null);
    let newClonedChild;
    if (doc && doc.importNode) {
      newClonedChild = doc.importNode(newChild, true);
    } else {
      newClonedChild = cloneMockTree(newChild);
    }
    moveBefore(oldParent, newClonedChild, insertionPoint);
    ctx.callbacks.afterNodeAdded(newClonedChild);
    return newClonedChild;
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
      parentNode: null,
      getAttribute(key) {
        const a = this.attributes.find(x => x.name === key);
        return a ? a.value : null;
      },
      setAttribute(key, val) {
        const a = this.attributes.find(x => x.name === key);
        if (a) a.value = val; else this.attributes.push({ name: key, value: val });
      },
      removeAttribute(key) {
        this.attributes = this.attributes.filter(x => x.name !== key);
      }
    };
    let prev = null;
    for (let c = node.firstChild; c; c = c.nextSibling) {
      const cc = cloneMockTree(c);
      cc.parentNode = copy;
      if (!copy.firstChild) copy.firstChild = cc;
      if (prev) prev.nextSibling = cc;
      prev = cc;
    }
    return copy;
  }

  function removeNode(ctx, node) {
    if (ctx.callbacks.beforeNodeRemoved(node) === false) return;
    if (node.parentNode) node.parentNode.removeChild(node);
    ctx.callbacks.afterNodeRemoved(node);
  }

  function removeNodesBetween(ctx, startInclusive, endExclusive) {
    let cursor = startInclusive;
    while (cursor && cursor !== endExclusive) {
      let temp = cursor;
      cursor = cursor.nextSibling;
      removeNode(ctx, temp);
    }
    return cursor;
  }

  function moveBefore(parentNode, element, after) {
    if (element === after) return;
    if (after) {
      parentNode.insertBefore(element, after);
    } else {
      parentNode.appendChild(element);
    }
  }

  function append(parentNode, element) {
    parentNode.appendChild(element);
  }

  function morphNode(oldNode, newContent, ctx) {
    if (ctx.callbacks.beforeNodeMorphed(oldNode, newContent) === false) return oldNode;
    morphAttributes(oldNode, newContent, ctx);
    if (oldNode.nodeType === 1 && newContent.nodeType === 1) {
      morphChildren(ctx, oldNode, newContent);
    }
    ctx.callbacks.afterNodeMorphed(oldNode, newContent);
    return oldNode;
  }

  function morphAttributes(oldNode, newNode, ctx) {
    if (oldNode.nodeType === 1 && newNode.nodeType === 1) {
      const nAttrs = newNode.attributes;
      if (nAttrs) {
        for (let i = 0; i < nAttrs.length; i++) {
          const a = nAttrs[i];
          if (oldNode.getAttribute(a.name) !== a.value) {
            oldNode.setAttribute(a.name, a.value);
          }
        }
      }
      const oAttrs = oldNode.attributes;
      if (oAttrs) {
        for (let i = oAttrs.length - 1; i >= 0; i--) {
          const name = oAttrs[i].name;
          if (newNode.getAttribute && newNode.getAttribute(name) === null) {
            oldNode.removeAttribute(name);
          }
        }
      }
    } else if (oldNode.nodeType === 3 && newNode.nodeType === 3) {
      if (oldNode.nodeValue !== newNode.nodeValue) {
        oldNode.nodeValue = newNode.nodeValue;
      }
    }
  }

  return { morph };
})();
