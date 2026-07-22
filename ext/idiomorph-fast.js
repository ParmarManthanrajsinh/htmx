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
      beforeAttributeUpdated: noOp,
    },
    head: {
      style: "merge",
      shouldPreserve: (elt) => elt.getAttribute && elt.getAttribute("im-preserve") === "true",
      shouldReAppend: (elt) => elt.getAttribute && elt.getAttribute("im-re-append") === "true",
      shouldRemove: noOp,
      afterHeadMorphed: noOp,
    },
    restoreFocus: true,
  };

  function normalizeParent(elt) {
    if (elt == null) return null;
    if (elt.nodeType === 1 || elt.nodeType === 11 || elt.nodeType === 9) return elt;
    return null;
  }

  function createMorphContext(oldNode, newContent, config) {
    const mergedConfig = Object.assign({}, defaults, config);
    const idMap = new Map();
    const persistentIds = new Set();

    function populateIdMap(node) {
      if (node && node.nodeType === 1) {
        const id = node.getAttribute ? node.getAttribute("id") : null;
        if (id) {
          persistentIds.add(id);
          let curr = node;
          while (curr) {
            let idSet = idMap.get(curr);
            if (!idSet) {
              idSet = new Set();
              idMap.set(curr, idSet);
            }
            idSet.add(id);
            curr = curr.parentNode;
          }
        }
        for (let child = node.firstChild; child; child = child.nextSibling) {
          populateIdMap(child);
        }
      }
    }

    populateIdMap(oldNode);

    const doc = oldNode.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const pantry = (doc && doc.createElement) ? doc.createElement("div") : { firstChild: null, appendChild() {} };

    return {
      target: oldNode,
      newContent,
      config: mergedConfig,
      idMap,
      persistentIds,
      callbacks: mergedConfig.callbacks,
      pantry
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
    const oldDirectChildIdMap = new Map();
    for (let c = insertionPoint; c && c !== endPoint; c = c.nextSibling) {
      if (c.nodeType === 1 && c.getAttribute) {
        const id = c.getAttribute("id");
        if (id) oldDirectChildIdMap.set(id, c);
      }
    }

    for (let newChild = newParent.firstChild; newChild; newChild = newChild.nextSibling) {
      let matchedNode = null;

      // 1. O(1) Direct ID lookup
      if (newChild.nodeType === 1 && newChild.getAttribute) {
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

      if (matchedNode) {
        if (matchedNode !== insertionPoint) {
          moveBefore(oldParent, matchedNode, insertionPoint);
        }
        morphNode(matchedNode, newChild, ctx);
        insertionPoint = matchedNode.nextSibling;
        continue;
      }

      // 3. Persistent ID lookups in full tree
      if (newChild.nodeType === 1) {
        const newChildId = newChild.getAttribute("id");
        if (newChildId && ctx.persistentIds.has(newChildId)) {
          const movedChild = moveBeforeById(oldParent, newChildId, insertionPoint, ctx);
          if (movedChild) {
            morphNode(movedChild, newChild, ctx);
            insertionPoint = movedChild.nextSibling;
            continue;
          }
        }
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
      removeNode(ctx, tempNode);
    }
  }

  function createNode(oldParent, newChild, insertionPoint, ctx) {
    if (ctx.callbacks.beforeNodeAdded(newChild) === false) return null;
    const doc = oldParent.ownerDocument || (typeof document !== 'undefined' ? document : null);
    let newClonedChild;
    if (doc && doc.importNode) {
      try {
        newClonedChild = doc.importNode(newChild, true);
      } catch (e) {
        newClonedChild = cloneMockTree(newChild);
      }
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
    if (ctx.idMap.has(node)) {
      moveBefore(ctx.pantry, node, null);
    } else {
      if (ctx.callbacks.beforeNodeRemoved(node) === false) return;
      if (node.parentNode) node.parentNode.removeChild(node);
      ctx.callbacks.afterNodeRemoved(node);
    }
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

  function moveBeforeById(parentNode, id, after, ctx) {
    function findById(node, targetId) {
      if (!node) return null;
      if (node.getAttribute && node.getAttribute("id") === targetId) return node;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        const found = findById(c, targetId);
        if (found) return found;
      }
      return null;
    }
    const target = findById(ctx.target, id) || findById(ctx.pantry, id);
    if (target) {
      removeElementFromAncestorsIdMaps(target, ctx);
      moveBefore(parentNode, target, after);
    }
    return target;
  }

  function removeElementFromAncestorsIdMaps(element, ctx) {
    const id = element.getAttribute ? element.getAttribute("id") : null;
    if (!id) return;
    let curr = element.parentNode;
    while (curr) {
      let idSet = ctx.idMap.get(curr);
      if (idSet) {
        idSet.delete(id);
        if (!idSet.size) ctx.idMap.delete(curr);
      }
      curr = curr.parentNode;
    }
  }

  function moveBefore(parentNode, element, after) {
    if (element === after) return;
    if (element.parentNode && element.parentNode.removeChild) {
      element.parentNode.removeChild(element);
    }
    element.parentNode = parentNode;
    element.nextSibling = null;

    if (after) {
      if (parentNode.firstChild === after) {
        element.nextSibling = parentNode.firstChild;
        parentNode.firstChild = element;
      } else {
        let prev = parentNode.firstChild;
        while (prev && prev.nextSibling !== after) {
          prev = prev.nextSibling;
        }
        if (prev) {
          element.nextSibling = after;
          prev.nextSibling = element;
        } else {
          append(parentNode, element);
        }
      }
    } else {
      append(parentNode, element);
    }
  }

  function append(parentNode, element) {
    if (!parentNode.firstChild) {
      parentNode.firstChild = element;
    } else {
      let last = parentNode.firstChild;
      while (last.nextSibling) last = last.nextSibling;
      last.nextSibling = element;
    }
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
      const oldAttrs = new Map();
      if (oldNode.attributes) {
        for (let i = 0; i < oldNode.attributes.length; i++) {
          oldAttrs.set(oldNode.attributes[i].name, oldNode.attributes[i].value);
        }
      }
      const newAttrs = new Set();
      if (newNode.attributes) {
        for (let i = 0; i < newNode.attributes.length; i++) {
          const a = newNode.attributes[i];
          newAttrs.add(a.name);
          if (oldAttrs.get(a.name) !== a.value) {
            oldNode.setAttribute(a.name, a.value);
          }
        }
      }
      for (const [k] of oldAttrs) {
        if (!newAttrs.has(k)) oldNode.removeAttribute(k);
      }
    } else if (oldNode.nodeType === 3 && newNode.nodeType === 3) {
      if (oldNode.nodeValue !== newNode.nodeValue) {
        oldNode.nodeValue = newNode.nodeValue;
      }
    }
  }

  return { morph };
})();
