import { JSDOM } from 'jsdom'
import { Idiomorph } from './idiomorph-upstream.js'
import { IdiomorphFast } from '../../ext/idiomorph-fast.js'

const { window } = new JSDOM()
const { document } = window
for (const key of Object.getOwnPropertyNames(window)) {
  if (key !== 'global' && key !== 'window' && key !== 'document' && typeof global[key] === 'undefined') {
    try {
      global[key] = window[key]
    } catch (e) {}
  }
}
global.window = window
global.document = document

function generateTreeHTML(shape, count) {
  let html = '<ul>'
  for (let i = 0; i < count; i++) {
    const idAttr = (shape === 'keyed' || shape === 'reorder') ? `id="item-${i}"` : ''
    html += `<li ${idAttr} class="cls-${i}">Item ${i}</li>`
  }
  html += '</ul>'
  return html
}

function generateNewTreeHTML(shape, count) {
  let html = '<ul>'
  for (let i = 0; i < count; i++) {
    const idAttr = (shape === 'keyed' || shape === 'reorder') ? `id="item-${i}"` : ''
    html += `<li ${idAttr} class="cls-${i}-new" data-updated="true">Item ${i} - updated</li>`
  }
  html += '</ul>'
  return html
}

function shuffleHTML(htmlStr) {
  const div = document.createElement('div')
  div.innerHTML = htmlStr
  const list = div.firstElementChild
  const items = Array.from(list.children)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]]
  }
  list.innerHTML = ''
  items.forEach(item => list.appendChild(item))
  return list.outerHTML
}

function createDOM(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.firstElementChild
}

function calcPercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
}

async function runBenchmark() {
  const sizes = [
    { label: 'small', count: 15, runs: 30 },
    { label: 'medium', count: 300, runs: 20 },
    { label: 'large', count: 1000, runs: 10 }
  ]

  const shapes = ['keyed', 'unkeyed', 'reorder']
  const warmupRuns = 5

  console.log('\n### Benchmark Results: Upstream Idiomorph vs IdiomorphFast (Real DOM)\n')
  console.log('| Shape | Node Count | Upstream Median | IdiomorphFast Median | **Speedup** | Upstream p95 | Fast p95 |')
  console.log('|---|---|---|---|---|---|---|')

  for (const { label, count, runs: iterations } of sizes) {
    for (const shape of shapes) {
      const oldHTML = generateTreeHTML(shape, count)
      let newHTML = generateNewTreeHTML(shape, count)
      if (shape === 'reorder') {
        newHTML = shuffleHTML(newHTML)
      }

      // 1. Upstream Idiomorph Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        Idiomorph.morph(createDOM(oldHTML), createDOM(newHTML))
      }
      const origTimes = []
      for (let i = 0; i < iterations; i++) {
        const o = createDOM(oldHTML)
        const n = createDOM(newHTML)
        const t0 = performance.now()
        Idiomorph.morph(o, n)
        origTimes.push(performance.now() - t0)
      }

      // 2. IdiomorphFast Benchmark
      for (let i = 0; i < warmupRuns; i++) {
        IdiomorphFast.morph(createDOM(oldHTML), createDOM(newHTML))
      }
      const fastTimes = []
      for (let i = 0; i < iterations; i++) {
        const o = createDOM(oldHTML)
        const n = createDOM(newHTML)
        const t0 = performance.now()
        IdiomorphFast.morph(o, n)
        fastTimes.push(performance.now() - t0)
      }

      const origMedian = calcPercentile(origTimes, 50)
      const origP95 = calcPercentile(origTimes, 95)

      const fastMedian = calcPercentile(fastTimes, 50)
      const fastP95 = calcPercentile(fastTimes, 95)

      const speedup = (origMedian / (fastMedian || 0.001)).toFixed(2)

      console.log(
        `| ${shape} | ${count} (${label}) | ${origMedian.toFixed(2)}ms | ${fastMedian.toFixed(2)}ms | **${speedup}x** | ${origP95.toFixed(2)}ms | ${fastP95.toFixed(2)}ms |`
      )
    }
  }
}

runBenchmark().catch(err => {
  console.error('Perf benchmark failed:', err)
  process.exit(1)
})
