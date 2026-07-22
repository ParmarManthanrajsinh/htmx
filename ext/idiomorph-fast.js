// High-Performance Pure-JS DOM Morphing Extension for htmx
// Fast O(1) direct child ID set matching - drop-in replacement for idiomorph

;(function() {
  'use strict'

  var IdiomorphFast = (function() {
    'use strict'

    const noOp = () => {}
    const defaults = {
      morphStyle: 'outerHTML',
      callbacks: {
        beforeNodeAdded: noOp,
        afterNodeAdded: noOp,
        beforeNodeMorphed: noOp,
        afterNodeMorphed: noOp,
        beforeNodeRemoved: noOp,
        afterNodeRemoved: noOp,
        beforeAttributeUpdated: noOp
      },
      restoreFocus: true,
      ignoreActiveValue: false
    }

    function normalizeParent(elt, doc) {
      if (elt == null) return null
      if (typeof elt === 'string') {
        return parseContent(elt, doc)
      }
      if (elt.nodeType === 1 || elt.nodeType === 11 || elt.nodeType === 9) return elt
      if (typeof elt.length === 'number') {
        doc = doc || (typeof document !== 'undefined' ? document : null)
        if (!doc) return null
        const dummyParent = doc.createElement('div')
        dummyParent._idfMultiRoot = true
        for (let i = 0; i < elt.length; i++) {
          dummyParent.appendChild(elt[i])
        }
        return dummyParent
      }
      return null
    }

    function parseContent(html, doc) {
      doc = doc || (typeof document !== 'undefined' ? document : null)
      if (!doc) return null
      const template = doc.createElement('template')
      template.innerHTML = html.trim()
      const fragment = template.content
      if (fragment.childNodes.length === 1 && fragment.firstChild.nodeType === 1) {
        return fragment.firstChild
      }
      const dummyParent = doc.createElement('div')
      dummyParent._idfMultiRoot = true
      while (fragment.firstChild) {
        dummyParent.appendChild(fragment.firstChild)
      }
      return dummyParent
    }

    function collectElementsWithId(root, map) {
      if (!root) return
      if (root.nodeType === 1 && root.getAttribute) {
        const id = root.getAttribute('id')
        if (id) {
          map.set(id, { count: 1, tagName: root.tagName })
        }
      }
      if (root.querySelectorAll) {
        const elts = root.querySelectorAll('[id]')
        for (let i = 0; i < elts.length; i++) {
          const elt = elts[i]
          if (elt === root) continue
          const id = elt.getAttribute('id')
          if (id) {
            const existing = map.get(id)
            if (existing) {
              existing.count++
            } else {
              map.set(id, { count: 1, tagName: elt.tagName })
            }
          }
        }
      } else {
        for (let c = root.firstChild; c; c = c.nextSibling) {
          collectElementsWithId(c, map)
        }
      }
    }

    function createPersistentIds(oldNode, newNode) {
      const oldMap = new Map()
      const newMap = new Map()
      collectElementsWithId(oldNode, oldMap)
      collectElementsWithId(newNode, newMap)

      const persistentIds = new Set()
      for (const [id, oldInfo] of oldMap.entries()) {
        if (oldInfo.count === 1) {
          const newInfo = newMap.get(id)
          if (newInfo && newInfo.count === 1 && newInfo.tagName === oldInfo.tagName) {
            persistentIds.add(id)
          }
        }
      }
      return persistentIds
    }

    function findElementById(root, id) {
      if (root.getAttribute && root.getAttribute('id') === id) return root
      for (let c = root.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) {
          const found = findElementById(c, id)
          if (found) return found
        }
      }
      return null
    }

    function createMorphContext(oldNode, newContent, config) {
      const mergedConfig = Object.assign({}, defaults, config)
      mergedConfig.callbacks = Object.assign({}, defaults.callbacks, config.callbacks || {})
      return {
        target: oldNode,
        newContent,
        config: mergedConfig,
        persistentIds: createPersistentIds(oldNode, newContent),
        callbacks: mergedConfig.callbacks
      }
    }

    function saveAndRestoreFocus(ctx, fn) {
      if (!ctx.config.restoreFocus) return fn()
      const doc = ctx.target.ownerDocument || (typeof document !== 'undefined' ? document : null)
      if (!doc) return fn()
      const activeElement = doc.activeElement
      if (!activeElement || activeElement === doc.body) return fn()
      if (!(activeElement instanceof doc.defaultView.HTMLInputElement) &&
          !(activeElement instanceof doc.defaultView.HTMLTextAreaElement)) {
        return fn()
      }
      const activeElementId = activeElement.id
      const selectionStart = activeElement.selectionStart
      const selectionEnd = activeElement.selectionEnd
      const results = fn()
      if (activeElementId) {
        const newActive = ctx.target.querySelector
          ? ctx.target.querySelector('[id="' + activeElementId.replace(/"/g, '\\"') + '"]')
          : null
        if (newActive && newActive !== doc.activeElement) {
          newActive.focus()
          if (typeof newActive.setSelectionRange === 'function' && selectionEnd != null) {
            try {
              newActive.setSelectionRange(selectionStart, selectionEnd)
            } catch (e) {}
          }
        }
      }
      return results
    }

    function ignoreValueOfActiveElement(oldNode, ctx) {
      if (!ctx.config.ignoreActiveValue) return false
      if (oldNode.nodeType !== 1) return false
      const doc = oldNode.ownerDocument || (typeof document !== 'undefined' ? document : null)
      return doc && oldNode === doc.activeElement && oldNode.tagName !== 'BODY'
    }

    function morph(oldNode, newContent, config = {}) {
      oldNode = normalizeParent(oldNode)
      if (!oldNode) return
      const doc = oldNode.ownerDocument || (typeof document !== 'undefined' ? document : null)
      const newNode = normalizeParent(newContent, doc)
      if (!newNode) return
      const ctx = createMorphContext(oldNode, newNode, config)
      const result = saveAndRestoreFocus(ctx, () => {
        if (ctx.config.morphStyle === 'innerHTML') {
          if (newNode._idfMultiRoot) {
            morphChildren(ctx, oldNode, newNode)
          } else {
            const wrapper = doc.createElement('div')
            wrapper.appendChild(doc.importNode(newNode, true))
            morphChildren(ctx, oldNode, wrapper)
          }
          return Array.from(oldNode.childNodes)
        } else if (newNode._idfMultiRoot) {
          if (oldNode.parentNode) {
            const oldParent = oldNode.parentNode
            morphChildren(ctx, oldParent, newNode, oldNode, oldNode.nextSibling)
            return Array.from(oldParent.childNodes)
          } else {
            morphChildren(ctx, oldNode, newNode)
            return Array.from(oldNode.childNodes)
          }
        } else {
          morphNode(oldNode, newNode, ctx)
          return [oldNode]
        }
      })
      return result || []
    }

    function morphChildren(ctx, oldParent, newParent, insertionPoint = null, endPoint = null) {
      insertionPoint = insertionPoint || oldParent.firstChild

      let oldDirectChildIdMap = null
      for (let c = insertionPoint; c && c !== endPoint; c = c.nextSibling) {
        if (c.nodeType === 1 && c.getAttribute) {
          const id = c.getAttribute('id')
          if (id) {
            if (!oldDirectChildIdMap) oldDirectChildIdMap = new Map()
            oldDirectChildIdMap.set(id, c)
          }
        }
      }

      for (let newChild = newParent.firstChild; newChild; newChild = newChild.nextSibling) {
        let matchedNode = null

        if (oldDirectChildIdMap && newChild.nodeType === 1 && newChild.getAttribute) {
          const newId = newChild.getAttribute('id')
          if (newId && oldDirectChildIdMap.has(newId)) {
            matchedNode = oldDirectChildIdMap.get(newId)
            oldDirectChildIdMap.delete(newId)
          }
        }

        if (!matchedNode && insertionPoint && insertionPoint !== endPoint) {
          if (insertionPoint.nodeType === newChild.nodeType && insertionPoint.tagName === newChild.tagName) {
            const oldId = insertionPoint.getAttribute ? insertionPoint.getAttribute('id') : null
            const newId = newChild.getAttribute ? newChild.getAttribute('id') : null
            if (!oldId || oldId === newId) {
              matchedNode = insertionPoint
            }
          }
        }

        if (!matchedNode && newChild.nodeType === 1 && newChild.getAttribute) {
          const newId = newChild.getAttribute('id')
          if (newId && ctx.persistentIds.has(newId)) {
            const found = findElementById(ctx.target, newId)
            if (found && found.tagName === newChild.tagName) {
              matchedNode = found
            }
          }
        }

        if (matchedNode) {
          if (matchedNode !== insertionPoint) {
            moveBefore(oldParent, matchedNode, insertionPoint)
          }
          morphNode(matchedNode, newChild, ctx)
          insertionPoint = matchedNode.nextSibling
          continue
        }

        const insertedNode = createNode(oldParent, newChild, insertionPoint, ctx)
        if (insertedNode) {
          insertionPoint = insertedNode.nextSibling
        }
      }

      while (insertionPoint && insertionPoint !== endPoint) {
        const tempNode = insertionPoint
        insertionPoint = insertionPoint.nextSibling
        if (tempNode.nodeType === 1 && tempNode.getAttribute) {
          const id = tempNode.getAttribute('id')
          if (id && ctx.persistentIds.has(id)) {
            continue
          }
        }
        removeNode(ctx, tempNode)
      }
    }

    function createNode(oldParent, newChild, insertionPoint, ctx) {
      if (ctx.callbacks.beforeNodeAdded(newChild) === false) return null
      const doc = oldParent.ownerDocument || (typeof document !== 'undefined' ? document : null)
      let newClonedChild
      if (doc && doc.importNode) {
        newClonedChild = doc.importNode(newChild, true)
      } else {
        newClonedChild = cloneMockTree(newChild)
      }
      moveBefore(oldParent, newClonedChild, insertionPoint)
      ctx.callbacks.afterNodeAdded(newClonedChild)
      return newClonedChild
    }

    function cloneMockTree(node) {
      if (!node) return null
      const copy = {
        nodeType: node.nodeType,
        tagName: node.tagName,
        attributes: node.attributes ? node.attributes.map(a => ({ name: a.name, value: a.value })) : [],
        nodeValue: node.nodeValue || '',
        firstChild: null,
        nextSibling: null,
        parentNode: null,
        getAttribute(key) {
          const a = this.attributes.find(x => x.name === key)
          return a ? a.value : null
        },
        setAttribute(key, val) {
          const a = this.attributes.find(x => x.name === key)
          if (a) a.value = val; else this.attributes.push({ name: key, value: val })
        },
        removeAttribute(key) {
          this.attributes = this.attributes.filter(x => x.name !== key)
        }
      }
      let prev = null
      for (let c = node.firstChild; c; c = c.nextSibling) {
        const cc = cloneMockTree(c)
        cc.parentNode = copy
        if (!copy.firstChild) copy.firstChild = cc
        if (prev) prev.nextSibling = cc
        prev = cc
      }
      return copy
    }

    function removeNode(ctx, node) {
      if (ctx.callbacks.beforeNodeRemoved(node) === false) return
      if (node.parentNode) node.parentNode.removeChild(node)
      ctx.callbacks.afterNodeRemoved(node)
    }

    function moveBefore(parentNode, element, after) {
      if (element === after) return
      if (after) {
        parentNode.insertBefore(element, after)
      } else {
        parentNode.appendChild(element)
      }
    }

    function morphNode(oldNode, newContent, ctx) {
      if (ctx.callbacks.beforeNodeMorphed(oldNode, newContent) === false) return oldNode
      morphAttributes(oldNode, newContent, ctx)
      if (oldNode.nodeType === 1 && newContent.nodeType === 1) {
        if (!ignoreValueOfActiveElement(oldNode, ctx)) {
          morphChildren(ctx, oldNode, newContent)
        }
      }
      ctx.callbacks.afterNodeMorphed(oldNode, newContent)
      return oldNode
    }

    function morphAttributes(oldNode, newNode, ctx) {
      if (oldNode.nodeType === 1 && newNode.nodeType === 1) {
        const nAttrs = newNode.attributes
        if (nAttrs) {
          for (let i = 0; i < nAttrs.length; i++) {
            const a = nAttrs[i]
            if (oldNode.getAttribute(a.name) !== a.value) {
              if (ctx.callbacks.beforeAttributeUpdated(a.name, oldNode, 'update') === false) continue
              oldNode.setAttribute(a.name, a.value)
            }
          }
        }
        const oAttrs = oldNode.attributes
        if (oAttrs) {
          for (let i = oAttrs.length - 1; i >= 0; i--) {
            const name = oAttrs[i].name
            if (newNode.getAttribute && newNode.getAttribute(name) === null) {
              if (ctx.callbacks.beforeAttributeUpdated(name, oldNode, 'remove') === false) continue
              oldNode.removeAttribute(name)
            }
          }
        }
        syncInputValue(oldNode, newNode, ctx)
      } else if (oldNode.nodeType === 3 && newNode.nodeType === 3) {
        if (oldNode.nodeValue !== newNode.nodeValue) {
          oldNode.nodeValue = newNode.nodeValue
        }
      }
    }

    function syncInputValue(oldElement, newElement, ctx) {
      if (oldElement instanceof HTMLInputElement && newElement instanceof HTMLInputElement && newElement.type !== 'file') {
        var newValue = newElement.value
        var oldValue = oldElement.value
        syncBooleanAttribute(oldElement, newElement, 'checked', ctx)
        syncBooleanAttribute(oldElement, newElement, 'disabled', ctx)
        if (!newElement.hasAttribute('value')) {
          if (ctx.callbacks.beforeAttributeUpdated('value', oldElement, 'remove') !== false) {
            oldElement.value = ''
            oldElement.removeAttribute('value')
          }
        } else if (oldValue !== newValue) {
          if (ctx.callbacks.beforeAttributeUpdated('value', oldElement, 'update') !== false) {
            oldElement.setAttribute('value', newValue)
            oldElement.value = newValue
          }
        }
      } else if (oldElement instanceof HTMLOptionElement && newElement instanceof HTMLOptionElement) {
        syncBooleanAttribute(oldElement, newElement, 'selected', ctx)
      } else if (oldElement instanceof HTMLTextAreaElement && newElement instanceof HTMLTextAreaElement) {
        var newValue = newElement.value
        var oldValue = oldElement.value
        if (ctx.callbacks.beforeAttributeUpdated('value', oldElement, 'update') === false) return
        if (newValue !== oldValue) {
          oldElement.value = newValue
        }
        if (oldElement.firstChild && oldElement.firstChild.nodeValue !== newValue) {
          oldElement.firstChild.nodeValue = newValue
        }
      }
    }

    function syncBooleanAttribute(oldElement, newElement, attr, ctx) {
      var newLive = newElement[attr]
      var oldLive = oldElement[attr]
      if (newLive !== oldLive) {
        if (ctx.callbacks.beforeAttributeUpdated(attr, oldElement, 'update') !== false) {
          oldElement[attr] = newElement[attr]
        }
        if (newLive) {
          if (ctx.callbacks.beforeAttributeUpdated(attr, oldElement, 'update') !== false) {
            oldElement.setAttribute(attr, '')
          }
        } else {
          if (ctx.callbacks.beforeAttributeUpdated(attr, oldElement, 'remove') !== false) {
            oldElement.removeAttribute(attr)
          }
        }
      }
    }

    return { morph }
  })()

  window.IdiomorphFast = IdiomorphFast

  function createMorphConfig(swapStyle) {
    if (swapStyle === 'morph' || swapStyle === 'morph:outerHTML') {
      return { morphStyle: 'outerHTML' }
    } else if (swapStyle === 'morph:innerHTML') {
      return { morphStyle: 'innerHTML' }
    } else if (swapStyle.startsWith('morph:')) {
      return Function('return (' + swapStyle.slice(6) + ')')()
    }
  }

  if (typeof htmx !== 'undefined') {
    htmx.defineExtension('morph', {
      isInlineSwap: function(swapStyle) {
        var config = createMorphConfig(swapStyle)
        return config === null || config.morphStyle === 'outerHTML'
      },
      handleSwap: function(swapStyle, target, fragment) {
        var config = createMorphConfig(swapStyle)
        if (config) {
          return IdiomorphFast.morph(target, fragment.children, config)
        }
      }
    })
  }
})()
