// Original Upstream Idiomorph v0.7.4 (bigskysoftware/idiomorph)

export var Idiomorph = (function () {
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
    mergedConfig.callbacks = Object.assign({}, defaults.callbacks, config.callbacks);
    mergedConfig.head = Object.assign({}, defaults.head, config.head);

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

    return {
      target: oldNode,
      newContent,
      config: mergedConfig,
      morphStyle: mergedConfig.morphStyle,
      ignoreActive: mergedConfig.ignoreActive,
      ignoreActiveValue: mergedConfig.ignoreActiveValue,
      restoreFocus: mergedConfig.restoreFocus,
      idMap,
      persistentIds,
      callbacks: mergedConfig.callbacks,
      head: mergedConfig.head,
      pantry: { remove() {} },
      activeElementAndParents: []
    };
  }

  function morph(oldNode, newContent, config = {}) {
    oldNode = normalizeParent(oldNode);
    const newNode = normalizeParent(newContent);
    if (!oldNode || !newNode) return;
    const ctx = createMorphContext(oldNode, newNode, config);

    if (ctx.morphStyle === "innerHTML") {
      morphChildren(ctx, oldNode, newNode);
      return oldNode;
    } else {
      morphChildren(ctx, oldNode.parentNode || oldNode, newNode, oldNode, oldNode.nextSibling);
      return oldNode;
    }
  }

  function morphChildren(ctx, oldParent, newParent, insertionPoint = null, endPoint = null) {
    insertionPoint = insertionPoint || oldParent.firstChild;

    for (let newChild = newParent.firstChild; newChild; newChild = newChild.nextSibling) {
      if (insertionPoint && insertionPoint !== endPoint) {
        const bestMatch = findBestMatch(ctx, newChild, insertionPoint, endPoint);
        if (bestMatch) {
          if (bestMatch !== insertionPoint) {
            removeNodesBetween(ctx, insertionPoint, bestMatch);
          }
          morphNode(bestMatch, newChild, ctx);
          insertionPoint = bestMatch.nextSibling;
          continue;
        }
      }

      if (newChild.nodeType === 1) {
        const newChildId = newChild.getAttribute("id");
        if (newChildId && ctx.persistentIds.has(newChildId)) {
          const movedChild = moveBeforeById(oldParent, newChildId, insertionPoint, ctx);
          morphNode(movedChild, newChild, ctx);
          insertionPoint = movedChild.nextSibling;
          continue;
        }
      }

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
    if (ctx.idMap.has(newChild)) {
      const doc = oldParent.ownerDocument || document;
      const newEmptyChild = doc.createElement(newChild.tagName);
      oldParent.insertBefore(newEmptyChild, insertionPoint);
      morphNode(newEmptyChild, newChild, ctx);
      ctx.callbacks.afterNodeAdded(newEmptyChild);
      return newEmptyChild;
    } else {
      const newClonedChild = cloneMockTree(newChild);
      oldParent.insertBefore(newClonedChild, insertionPoint);
      ctx.callbacks.afterNodeAdded(newClonedChild);
      return newClonedChild;
    }
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

  function findBestMatch(ctx, node, startPoint, endPoint) {
    let softMatch = null;
    let nextSibling = node.nextSibling;
    let siblingSoftMatchCount = 0;
    let cursor = startPoint;

    while (cursor && cursor !== endPoint) {
      if (isSoftMatch(cursor, node)) {
        if (isIdSetMatch(ctx, cursor, node)) {
          return cursor;
        }
        if (softMatch === null) {
          if (!ctx.idMap.has(cursor)) {
            softMatch = cursor;
          }
        }
      }
      if (softMatch === null && nextSibling && isSoftMatch(cursor, nextSibling)) {
        siblingSoftMatchCount++;
        nextSibling = nextSibling.nextSibling;
        if (siblingSoftMatchCount >= 2) {
          softMatch = undefined;
        }
      }
      cursor = cursor.nextSibling;
    }
    return softMatch || null;
  }

  function isIdSetMatch(ctx, oldNode, newNode) {
    let oldSet = ctx.idMap.get(oldNode);
    let newSet = ctx.idMap.get(newNode);
    if (!newSet || !oldSet) return false;
    for (const id of oldSet) {
      if (newSet.has(id)) return true;
    }
    return false;
  }

  function isSoftMatch(oldNode, newNode) {
    if (oldNode.nodeType !== newNode.nodeType || oldNode.tagName !== newNode.tagName) return false;
    const oldId = oldNode.getAttribute ? oldNode.getAttribute("id") : null;
    const newId = newNode.getAttribute ? newNode.getAttribute("id") : null;
    return (!oldId || oldId === newId);
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
    const target = findById(ctx.target, id);
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
