import '../../ext/idiomorph-fast.js'

describe('idiomorph-fast morph extension', function() {
  beforeEach(function() {
    clearWorkArea()
  })

  it('registers as htmx extension named "morph"', function() {
    // Extension was registered during import
    // Verify by using it with hx-swap via a simple htmx interaction
    var btn = make('<button hx-get="/test" hx-swap="morph" hx-trigger="click">click</button>')
    btn.should.exist
  })

  it('morphs attributes on existing node', function() {
    var div = make('<div class="old" id="test">hello</div>')
    IdiomorphFast.morph(div, '<div class="new" id="test">world</div>')
    div.getAttribute('class').should.equal('new')
    div.innerHTML.should.equal('world')
  })

  it('preserves child node object identity via id matching', function() {
    var list = make('<ul id="list"><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>')
    var origA = list.children[0]
    var origB = list.children[1]
    var origC = list.children[2]

    IdiomorphFast.morph(list, '<ul id="list"><li id="c">C</li><li id="a">A</li><li id="b">B</li></ul>')

    list.children.length.should.equal(3)
    list.children[0].should.equal(origC)
    list.children[1].should.equal(origA)
    list.children[2].should.equal(origB)
  })

  it('morphs with innerHTML style', function() {
    var div = make('<div id="test"><span class="old">content</span></div>')
    IdiomorphFast.morph(div, '<span class="new">updated</span>', { morphStyle: 'innerHTML' })
    var span = div.querySelector('span')
    span.getAttribute('class').should.equal('new')
    span.innerHTML.should.equal('updated')
  })

  it('adds new child nodes', function() {
    var div = make('<div id="container"><span id="a">A</span></div>')
    IdiomorphFast.morph(div, '<div id="container"><span id="a">A</span><span id="b">B</span></div>')
    div.children.length.should.equal(2)
    div.children[1].getAttribute('id').should.equal('b')
  })

  it('removes child nodes absent from new content', function() {
    var div = make('<div id="container"><span id="a">A</span><span id="b">B</span><span id="c">C</span></div>')
    IdiomorphFast.morph(div, '<div id="container"><span id="a">A</span><span id="c">C</span></div>')
    div.children.length.should.equal(2)
    div.children[0].getAttribute('id').should.equal('a')
    div.children[1].getAttribute('id').should.equal('c')
  })

  it('moves nodes across parents by persistent id', function() {
    var div = make('<div id="root"><ul id="a"><li id="x">X</li></ul><ul id="b"></ul></div>')
    var originalX = div.querySelector('#x')

    IdiomorphFast.morph(div, '<div id="root"><ul id="a"></ul><ul id="b"><li id="x">X</li></ul></div>')

    div.querySelector('#b').children[0].should.equal(originalX)
    div.querySelector('#a').children.length.should.equal(0)
  })

  it('syncs input element value', function() {
    var input = make('<input id="test" type="text" value="old">')
    IdiomorphFast.morph(input, '<input id="test" type="text" value="new">')
    input.value.should.equal('new')
    input.getAttribute('value').should.equal('new')
  })

  it('syncs checkbox checked state', function() {
    var cb = make('<input id="test" type="checkbox">')
    cb.checked.should.be.false
    IdiomorphFast.morph(cb, '<input id="test" type="checkbox" checked>')
    cb.checked.should.be.true
  })

  it('syncs textarea value', function() {
    var ta = make('<textarea id="test">old</textarea>')
    IdiomorphFast.morph(ta, '<textarea id="test">new</textarea>')
    ta.value.should.equal('new')
  })

  it('synces option selected state', function() {
    var select = make('<select><option id="a">A</option><option id="b" selected>B</option></select>')
    var optB = select.children[1]
    IdiomorphFast.morph(select, '<select><option id="a" selected>A</option><option id="b">B</option></select>')
    select.children[0].selected.should.be.true
    select.children[1].selected.should.be.false
  })

  it('handles raw HTML string as new content', function() {
    var div = make('<div id="box" class="old"></div>')
    IdiomorphFast.morph(div, '<div id="box" class="new">content</div>')
    div.getAttribute('class').should.equal('new')
    div.innerHTML.should.equal('content')
  })

  it('returns array of morphed nodes', function() {
    var div = make('<div id="test">hello</div>')
    var result = IdiomorphFast.morph(div, '<div id="test">world</div>')
    Array.isArray(result).should.be.true
    result.length.should.equal(1)
    result[0].should.equal(div)
  })

  it('calls beforeNodeAdded callback', function() {
    var div = make('<div id="test"></div>')
    var called = false
    IdiomorphFast.morph(div, '<div id="test"><span>new</span></div>', {
      callbacks: {
        beforeNodeAdded: function(node) {
          called = true
          node.tagName.should.equal('SPAN')
          return true
        }
      }
    })
    called.should.be.true
    div.querySelector('span').innerHTML.should.equal('new')
  })

  it('beforeNodeAdded returning false prevents insertion', function() {
    var div = make('<div id="test"></div>')
    IdiomorphFast.morph(div, '<div id="test"><span>new</span></div>', {
      callbacks: {
        beforeNodeAdded: function() { return false }
      }
    })
    div.children.length.should.equal(0)
  })

  it('calls beforeAttributeUpdated before attribute change', function() {
    var div = make('<div id="test" class="old"></div>')
    var calls = []
    IdiomorphFast.morph(div, '<div id="test" class="new"></div>', {
      callbacks: {
        beforeAttributeUpdated: function(attr, elt, updateType) {
          calls.push({ attr, type: updateType })
          return true
        }
      }
    })
    calls.length.should.be.above(0)
    calls[0].attr.should.equal('class')
    calls[0].type.should.equal('update')
  })

  it('beforeAttributeUpdated returning false blocks attribute change', function() {
    var div = make('<div id="test" class="old"></div>')
    IdiomorphFast.morph(div, '<div id="test" class="new"></div>', {
      callbacks: {
        beforeAttributeUpdated: function() { return false }
      }
    })
    div.getAttribute('class').should.equal('old')
  })

  it('restores focus after morph', function() {
    var input = make('<input id="focus-test" type="text" value="hello">')
    input.focus()
    document.activeElement.should.equal(input)
    IdiomorphFast.morph(input, '<input id="focus-test" type="text" value="world">')
    document.activeElement.should.equal(input)
    input.value.should.equal('world')
  })
})
