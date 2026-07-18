/**
 * The pipeline's EYES — headless page capture, owned by the engine itself.
 *
 * Drives the machine's installed Edge via playwright-core (no browser download), serving the BUILT
 * page from a throwaway static server on an ephemeral port. Deliberately independent of any
 * interactive browser tooling: headless Chromium runs rAF normally, so scroll-driven states render,
 * and none of the hidden-tab traps documented in CLAUDE.md apply here.
 *
 * Captures are what a human sees: viewport-sized shots at even scroll intervals, plus one narrow
 * full-page overview for composition. Full-page-only screenshots hide pinned/sticky behaviour and
 * compress defects into invisibility.
 */

import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright-core'

const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
]

/** Locate a system Chromium-family browser — Edge ships with Windows, so this effectively always resolves. */
export function findBrowser(): string | null {
  for (const p of [...EDGE_PATHS, ...CHROME_PATHS]) if (existsSync(p)) return p
  return null
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2'
}

/** Serve a built site directory on an ephemeral localhost port. Caller must close(). */
export function serveDir(dir: string): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      try {
        const raw = decodeURIComponent((req.url ?? '/').split('?')[0])
        let rel = normalize(raw).replace(/^([/\\])+/, '')
        if (rel === '' || rel.endsWith('/') || rel.endsWith('\\')) rel = join(rel, 'index.html')
        const file = join(dir, rel)
        if (!normalize(file).startsWith(normalize(dir)) || !existsSync(file)) {
          res.writeHead(404).end('not found')
          return
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' })
        res.end(readFileSync(file))
      } catch {
        res.writeHead(500).end()
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return reject(new Error('no ephemeral port'))
      resolve({ url: `http://127.0.0.1:${addr.port}/`, close: () => server.close() })
    })
  })
}

export interface PageShot {
  /** e.g. 'viewport-0' (scrollY 0), 'viewport-1600', 'overview' */
  label: string
  png: Buffer
  scrollY: number
}

export interface SectionRect {
  /** DOM order — matches the generated section index in App.tsx composition */
  index: number
  top: number
  height: number
}

/** A MEASURED horizontal overflow — DOM facts, not vision. One widened element shifts/clips the
 *  whole page (observed live: text flush at x=0 AND captions clipped at the right edge, same cause). */
export interface HorizontalOverflow {
  scrollWidth: number
  viewport: number
  /** tag.class of the widest offender and its measured extent */
  offender: string
  offenderLeft: number
  offenderRight: number
  /** index of the top-level section containing the offender (-1 if outside any) */
  sectionIndex: number
}

/**
 * A MEASURED element-vs-container overflow — an image bleeding past its own card. Distinct from
 * HorizontalOverflow, which is page-vs-viewport: a card-level bleed never widens the page, so the
 * viewport check cannot see it (observed live on the Fenwick "Where to find us" card).
 */
export interface ContainerBleed {
  sectionIndex: number
  /** tag.class of the bleeding element and of the container it escapes */
  element: string
  container: string
  /** how far past the container it extends, px, worst side */
  overflowPx: number
  side: 'left' | 'right' | 'both'
}

/**
 * A MEASURED horizontal void — DOM facts, not vision. Two shapes, one symptom (a big empty band):
 *  - 'unequal-columns': an asymmetric two-column row where one column is a fraction of the other's
 *    height under align-items:start (a 4-line text column beside a tall card).
 *  - 'half-empty-grid': content pinned to one side of a full-width container (max-w-* + left/right
 *    alignment) leaving the other 35%+ of the width empty for most of the section's height. This is
 *    the MORE COMMON void (observed on Fenwick: max-w-3xl copy left-pinned in a full-width grid).
 * The measurement names the MECHANISM so the revise gets a structural handle, not "empty space".
 */
export interface HorizontalVoid {
  kind: 'unequal-columns' | 'half-empty-grid'
  sectionIndex: number
  /** the offending row/container's own class, for locating it in the source */
  rowClass: string
  /** the empty band as a fraction of the container width (half-empty-grid) or the height gap in vh (unequal-columns) */
  emptyFraction: number
  detail: string
}

/**
 * A section that is mostly empty DOWN the page.
 *
 * The void measurement was horizontal only, so a section could be 2268px tall, 25% covered, and
 * carry a 1305px unbroken band of nothing — and the only thing watching was the vision model, whose
 * dead-zone findings are capped at `major` and therefore ship. Observed exactly that: a hero whose
 * pinned-scroll runway rendered as ~900px of blank space above the content.
 *
 * Measured from the DOM, so it outranks vision and can block.
 */
export interface VerticalVoid {
  sectionIndex: number
  sectionClass: string
  heightPx: number
  /** percentage of the section's height covered by real text/images */
  inkPct: number
  /** the largest unbroken vertical band with nothing in it */
  biggestGapPx: number
  detail: string
}

/**
 * Text that cannot be read against what is actually behind it.
 *
 * The palette guarantees contrast between its OWN tokens, but that says nothing about a section that
 * hardcodes `text-white` because it expects a dark image behind it — and then ships without the
 * image. Observed live: a hero whose title rendered rgb(255,255,255) on rgb(250,247,242), a contrast
 * ratio of 1.07. The words were present, correctly sized, correctly placed, and completely invisible.
 *
 * Nothing else could catch it. The DOM says the text exists, so the void check sees low coverage but
 * cannot explain it; a vision critic looking at a blank cream band has no reason to call it a
 * contrast fault. Only computing the ratio finds it, so it is computed.
 */
export interface ContrastFailure {
  sectionIndex: number
  text: string
  color: string
  background: string
  ratio: number
  fontPx: number
}

export interface CaptureResult {
  shots: PageShot[]
  pageHeight: number
  consoleErrors: string[]
  /** measured unreadable text — worst (lowest ratio) first */
  contrastFailures: ContrastFailure[]
  /** measured vertical voids — sections that are mostly empty down the page, worst first */
  verticalVoids: VerticalVoid[]
  /** top-level section geometry, so a critic can map a shot's scroll range to section indexes */
  sectionRects: SectionRect[]
  /** set when the page is wider than the viewport — an automatic blocking defect, no vision needed */
  horizontalOverflow: HorizontalOverflow | null
  /** measured horizontal voids (unequal columns OR half-empty grids) — worst first */
  horizontalVoids: HorizontalVoid[]
  /** measured images bleeding past their own container — worst first */
  containerBleeds: ContainerBleed[]
}

/**
 * Capture a page: N viewport shots at even scroll steps + one narrow full-page overview.
 * Console errors are collected — a runtime crash is a visual defect the critic must know about.
 */
export async function capturePage(url: string, opts?: { maxViewportShots?: number }): Promise<CaptureResult> {
  const exe = findBrowser()
  if (!exe) throw new Error('no system Edge/Chrome found for headless capture')
  const browser = await chromium.launch({ executablePath: exe, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const consoleErrors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
    page.on('pageerror', (e) => consoleErrors.push(String(e.message ?? e).slice(0, 200)))

    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    // fonts + first paint settle; images are pre-warmed (cached) upstream, so 'load' means loaded
    await page.evaluate('document.fonts ? document.fonts.ready : true')
    await page.waitForTimeout(900)

    const pageHeight = (await page.evaluate('document.documentElement.scrollHeight')) as number
    // MEASURED overflow check — same "catch the unknown shape" principle as the image residual
    // warning: no enumeration of CSS escape hatches (w-screen, fixed widths, col-start overflow…)
    // can be complete, but scrollWidth > viewport catches every one of them, with the offender
    // identified by measurement instead of vision.
    const horizontalOverflow = (await page.evaluate(`(() => {
      const vw = document.documentElement.clientWidth
      const sw = document.documentElement.scrollWidth
      if (sw <= vw + 1) return null
      let worst = null
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width < 40) continue
        const over = Math.max(0, r.right - vw) + Math.max(0, -r.left)
        if (over > 8 && (!worst || over > worst.over)) {
          const cls = typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 3).join('.') : ''
          const sec = el.closest('section')
          let idx = -1
          if (sec) {
            const tops = Array.from(document.querySelectorAll('section')).filter((s) => !s.parentElement.closest('section'))
            idx = tops.indexOf(sec.parentElement.closest('section') || sec)
          }
          worst = { over, offender: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), offenderLeft: Math.round(r.left), offenderRight: Math.round(r.right), sectionIndex: idx }
        }
      }
      return worst ? { scrollWidth: sw, viewport: vw, offender: worst.offender, offenderLeft: worst.offenderLeft, offenderRight: worst.offenderRight, sectionIndex: worst.sectionIndex } : null
    })()`)) as HorizontalOverflow | null

    // MEASURED container-bleed check — an image escaping its OWN card. The page-vs-viewport check
    // above cannot see this: a card-level bleed does not widen the document.
    const containerBleeds = (await page.evaluate(`(() => {
      const tops = Array.from(document.querySelectorAll('section')).filter((s) => !s.parentElement.closest('section'))
      const clsOf = (el) => { const c = typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 3).join('.') : ''; return el.tagName.toLowerCase() + (c ? '.' + c : '') }
      const out = []
      for (const img of document.querySelectorAll('img, figure, picture, video')) {
        const parent = img.parentElement
        if (!parent) continue
        if (parent.tagName === 'BODY' || parent.tagName === 'HTML') continue
        const pcs = getComputedStyle(parent), ics = getComputedStyle(img)
        const r = img.getBoundingClientRect(), p = parent.getBoundingClientRect()
        if (r.width < 40 || p.width < 40) continue

        // Shape A — a CLIPPING parent whose aspect fights the image's own aspect: the picture is
        // forced past its frame and cropped. Invisible to a pure bounds check because the clip hides
        // the excess (observed live: a shot-wide card holding a shot-detail image).
        if (pcs.overflow !== 'visible') {
          const ia = ics.aspectRatio, pa = pcs.aspectRatio
          const parsed = (v) => { const m = /^(\\d+(?:\\.\\d+)?)\\s*\\/\\s*(\\d+(?:\\.\\d+)?)$/.exec(v || ''); return m ? Number(m[1]) / Number(m[2]) : null }
          const ir = parsed(ia), pr = parsed(pa)
          if (ir && pr && Math.abs(ir - pr) / pr > 0.15) {
            const sec0 = img.closest('section')
            out.push({ sectionIndex: sec0 ? tops.indexOf(sec0.parentElement.closest('section') || sec0) : -1, element: clsOf(img), container: clsOf(parent), overflowPx: Math.round(Math.abs(r.height - p.height)), side: 'both' })
          }
          continue
        }

        // Shape B — a plain bleed past a non-clipping container.
        const overL = Math.max(0, p.left - r.left), overR = Math.max(0, r.right - p.right)
        const worst = Math.max(overL, overR)
        if (worst <= 4) continue // sub-pixel / rounding
        const sec = img.closest('section')
        const idx = sec ? tops.indexOf(sec.parentElement.closest('section') || sec) : -1
        out.push({ sectionIndex: idx, element: clsOf(img), container: clsOf(parent), overflowPx: Math.round(worst), side: overL > 4 && overR > 4 ? 'both' : (overL > overR ? 'left' : 'right') })
      }
      return out.sort((a, b) => b.overflowPx - a.overflowPx).slice(0, 4)
    })()`)) as ContainerBleed[]

    // MEASURED horizontal-void check — two shapes, one output list. DOM facts so the revise gets an
    // exact structural handle instead of vision's "empty space".
    const horizontalVoids = (await page.evaluate(`(() => {
      const vh = document.documentElement.clientHeight
      const tops = Array.from(document.querySelectorAll('section')).filter((s) => !s.parentElement.closest('section'))
      const secIdx = (el) => { const s = el.closest('section'); return s ? tops.indexOf(s.parentElement.closest('section') || s) : -1 }
      const clsOf = (el) => { const c = typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 4).join('.') : ''; return el.tagName.toLowerCase() + (c ? '.' + c : '') }
      const out = []

      // Shape 1 — unequal columns: a side-by-side row whose short child is a fraction of the tall one.
      for (const row of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(row)
        const isRow = cs.display === 'grid' || (cs.display === 'flex' && cs.flexDirection.startsWith('row'))
        if (!isRow) continue
        const kids = Array.from(row.children).filter((c) => c.getBoundingClientRect().width >= 120)
        if (kids.length < 2) continue
        const rects = kids.map((c) => c.getBoundingClientRect())
        const minTop = Math.min(...rects.map((r) => r.top))
        if (rects.some((r) => r.top - minTop > 40)) continue
        const heights = rects.map((r) => r.height)
        const tall = Math.max(...heights), short = Math.min(...heights)
        if (tall < vh * 0.5) continue
        const gapVh = (tall - short) / vh
        if (short / tall > 0.55 || gapVh < 0.4) continue
        const items = cs.alignItems
        out.push({ kind: 'unequal-columns', sectionIndex: secIdx(row), rowClass: clsOf(row), emptyFraction: Math.round(gapVh * 100) / 100, detail: 'short column ' + Math.round(short) + 'px vs tall ' + Math.round(tall) + 'px' + ((items === 'start' || items === 'flex-start' || items === 'baseline') ? ' under align-items:start' : '') + ', ~' + (Math.round(gapVh * 10) / 10) + ' viewport-height(s) of void beside the short column' })
      }

      // Shape 2 — half-empty grid: content occupies one side of a wide container, leaving a tall empty
      // band on the other side. Measure each top-level section's content bounding-box vs its width.
      for (let i = 0; i < tops.length; i++) {
        const sec = tops[i]
        const secR = sec.getBoundingClientRect()
        if (secR.width < 700 || secR.height < vh * 0.6) continue // needs to be a wide, tall section
        // union of the horizontal extent of the section's TEXT/MEDIA leaves (ignore full-width bg wrappers)
        let minL = Infinity, maxR = -Infinity, contentH = 0
        for (const el of sec.querySelectorAll('p, h1, h2, h3, li, img, figure, ul, ol, blockquote, a, button')) {
          const r = el.getBoundingClientRect()
          if (r.width < 24 || r.height < 12) continue
          minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right); contentH += r.height
        }
        if (!isFinite(minL) || contentH < vh * 0.5) continue // little content = a spacer, not a void
        const contentW = maxR - minL
        const usedFrac = contentW / secR.width
        if (usedFrac >= 0.68) continue // fills enough of the width
        const emptySide = (minL - secR.left) > (secR.right - maxR) ? 'left' : 'right'
        out.push({ kind: 'half-empty-grid', sectionIndex: i, rowClass: clsOf(sec), emptyFraction: Math.round((1 - usedFrac) * 100) / 100, detail: 'content uses only ' + Math.round(usedFrac * 100) + '% of the section width, pinned to the ' + (emptySide === 'left' ? 'right' : 'left') + ' — the ' + emptySide + ' ~' + Math.round((1 - usedFrac) * 100) + '% is an empty vertical band' })
      }
      // worst first (largest empty fraction), dedup by section+kind, cap
      return out.sort((a, b) => b.emptyFraction - a.emptyFraction).slice(0, 5)
    })()`)) as HorizontalVoid[]
    // MEASURED CONTRAST — text against what is genuinely painted behind it.
    // Walks ancestors for the first real background (colour or image); an image behind the text is
    // treated as satisfied, because its brightness cannot be known from the DOM and guessing would
    // produce false alarms on legitimate overlay heroes.
    const contrastFailures = (await page.evaluate(`(() => {
      // Two channel scales in the wild and they look identical to a naive parser:
      //   rgb(107, 97, 83)                  -> 0-255
      //   color(srgb 0.419 0.380 0.325)     -> 0-1   (what Chrome increasingly returns)
      // Dividing the second form by 255 makes every muted colour compute as near-black and report a
      // contrast ratio of 1 against everything. Caught exactly that on a real page: six false
      // positives on perfectly readable body copy, which would have blocked every run.
      const lum = (c) => {
        const str = String(c)
        const m = str.match(/[\\d.]+/g)
        if (!m || m.length < 3) return null
        const nums = m.map(Number)
        // color(srgb ...) omits a leading colour-space number, so channels are the first three.
        const isUnit = /^color\\(/i.test(str)
        const ch = nums.slice(0, 3)
        if (!isUnit && nums.length >= 4 && nums[3] === 0) return null // transparent rgba
        if (isUnit && nums.length >= 4 && nums[3] === 0) return null
        const v = ch.map((n) => {
          const x = isUnit ? n : n / 255
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
      }
      const secs = Array.from(document.querySelectorAll('section')).filter((s) => !s.parentElement.closest('section'))
      const idxOf = (el) => { const s = el.closest('section'); const t = secs.find((x) => x === s || x.contains(el)); return t ? secs.indexOf(t) : 0 }
      const out = []
      const seen = new Set()
      for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li,span,a,button,figcaption,blockquote')) {
        const txt = (el.textContent || '').trim()
        if (txt.length < 3) continue
        if (el.querySelector('h1,h2,h3,h4,p,li,span,a,button')) continue // only leaf-ish text
        const r = el.getBoundingClientRect()
        if (r.width < 12 || r.height < 6) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        if (parseFloat(cs.opacity) < 0.15) continue
        const fg = lum(cs.color)
        if (fg === null) continue
        // first ancestor that actually paints something
        let bg = null, node = el, viaImage = false
        while (node && node !== document.documentElement) {
          const s2 = getComputedStyle(node)
          if (s2.backgroundImage && s2.backgroundImage !== 'none') { viaImage = true; break }
          const b = lum(s2.backgroundColor)
          if (b !== null) { bg = b; break }
          node = node.parentElement
        }
        if (viaImage) continue // an image is behind it; brightness unknowable, do not guess
        if (bg === null) { const b = lum(getComputedStyle(document.body).backgroundColor); if (b === null) continue; bg = b }
        const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
        const fontPx = parseFloat(cs.fontSize) || 16
        // WCAG AA: 4.5 normally, 3.0 for large text (>=24px, or >=18.66px bold).
        const large = fontPx >= 24 || (fontPx >= 18.66 && Number(cs.fontWeight) >= 700)
        if (ratio >= (large ? 3 : 4.5)) continue
        const key = txt.slice(0, 24) + '|' + cs.color
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ sectionIndex: idxOf(el), text: txt.slice(0, 60), color: cs.color, background: node ? getComputedStyle(node).backgroundColor : 'body', ratio: Math.round(ratio * 100) / 100, fontPx: Math.round(fontPx) })
      }
      return out.sort((a, b) => a.ratio - b.ratio).slice(0, 6)
    })()`)) as ContrastFailure[]

    // MEASURED VERTICAL VOIDS — how much of each section is actually covered, down the page.
    // Ink = text leaves and images, merged into bands; the gaps between bands are real emptiness.
    // Deliberately generous thresholds: normal editorial sections measure 53-64% ink, so only a
    // genuinely broken section trips this.
    const verticalVoids = (await page.evaluate(`(() => {
      const out = []
      const secs = Array.from(document.querySelectorAll('section')).filter((s) => !s.parentElement.closest('section'))
      secs.forEach((s, i) => {
        const sr = s.getBoundingClientRect()
        if (sr.height < 400) return // short sections cannot hold a meaningful void
        // A PINNED section is tall BY DESIGN: the spacer provides scroll distance while the sticky
        // child renders across the whole of it, so the reader never sees a gap. Its DOM geometry
        // says the opposite — the child's box sits at one offset and the rest of the spacer measures
        // as empty. Measuring bands here flags a correctly pinned hero as catastrophically broken.
        // Verified on a real pinned hero: DOM bands reported 25% coverage with a 1305px void, while
        // viewport sampling through the same section showed 55-62% ink at EVERY scroll position.
        // Nothing is wrong with it, so this heuristic must not judge it.
        if (s.querySelector('[class*="pin-spacer"], .pin-spacer')) return
        for (const d of s.querySelectorAll('*')) {
          if (getComputedStyle(d).position === 'sticky') return
        }
        const bands = []
        for (const el of s.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.height < 6 || r.width < 6) continue
          const isTextLeaf = el.children.length === 0 && (el.textContent || '').trim().length > 0
          if (!isTextLeaf && el.tagName !== 'IMG' && el.tagName !== 'SVG' && el.tagName !== 'VIDEO') continue
          bands.push([r.top - sr.top, r.bottom - sr.top])
        }
        if (!bands.length) {
          out.push({ sectionIndex: i, sectionClass: (s.className || '').slice(0, 60), heightPx: Math.round(sr.height), inkPct: 0, biggestGapPx: Math.round(sr.height), detail: 'section renders no text or imagery at all' })
          return
        }
        bands.sort((a, b) => a[0] - b[0])
        const merged = []
        for (const b of bands) {
          const last = merged[merged.length - 1]
          if (last && b[0] <= last[1] + 4) last[1] = Math.max(last[1], b[1])
          else merged.push([b[0], b[1]])
        }
        const ink = merged.reduce((n, m) => n + (m[1] - m[0]), 0)
        let gap = merged[0][0]
        for (let j = 1; j < merged.length; j++) gap = Math.max(gap, merged[j][0] - merged[j - 1][1])
        gap = Math.max(gap, sr.height - merged[merged.length - 1][1])
        const inkPct = Math.round((ink / sr.height) * 100)
        const gapPx = Math.round(gap)
        // Trip on EITHER a huge unbroken band or an overall coverage collapse.
        if (gapPx >= 600 || inkPct < 30) {
          out.push({ sectionIndex: i, sectionClass: (s.className || '').slice(0, 60), heightPx: Math.round(sr.height), inkPct: inkPct, biggestGapPx: gapPx, detail: 'section is ' + Math.round(sr.height) + 'px tall but only ' + inkPct + '% of that height carries text or imagery, with an unbroken empty band of ' + gapPx + 'px' })
        }
      })
      return out.sort((a, b) => b.biggestGapPx - a.biggestGapPx).slice(0, 5)
    })()`)) as VerticalVoid[]
    // top-level sections only (a nested <section> belongs to its parent's index)
    const sectionRects = (await page.evaluate(`
      Array.from(document.querySelectorAll('section'))
        .filter((s) => !s.parentElement.closest('section'))
        .map((s, i) => { const r = s.getBoundingClientRect(); return { index: i, top: Math.round(r.top + window.scrollY), height: Math.round(r.height) } })
    `)) as SectionRect[]
    const maxShots = opts?.maxViewportShots ?? 5
    const steps = Math.min(maxShots, Math.max(1, Math.ceil(pageHeight / 800)))
    const shots: PageShot[] = []
    for (let i = 0; i < steps; i++) {
      const y = steps === 1 ? 0 : Math.round((i * (pageHeight - 800)) / (steps - 1))
      await page.evaluate(`window.scrollTo(0, ${y})`)
      await page.waitForTimeout(450) // let scroll-driven states settle
      shots.push({ label: `viewport-${y}`, png: await page.screenshot({ type: 'png' }), scrollY: y })
    }

    // narrow full-page overview — composition at a glance. Anthropic caps image dimensions at
    // 8000px. TWO-PHASE on purpose: the scale must come from the page's height AT 720px WIDTH —
    // content reflows far taller in a narrow column, and scaling by the 1280px height blew the cap
    // on a real 20k-px page. Measure first, then reopen at the right deviceScaleFactor.
    const probe = await browser.newPage({ viewport: { width: 720, height: 800 } })
    await probe.goto(url, { waitUntil: 'load', timeout: 30000 })
    const h720 = (await probe.evaluate('document.documentElement.scrollHeight')) as number
    await probe.close()
    const overviewScale = Math.min(0.5, 7600 / Math.max(1, h720))
    const overviewPage = await browser.newPage({ viewport: { width: 720, height: 800 }, deviceScaleFactor: overviewScale })
    await overviewPage.goto(url, { waitUntil: 'load', timeout: 30000 })
    await overviewPage.waitForTimeout(700)
    shots.push({ label: 'overview', png: await overviewPage.screenshot({ type: 'png', fullPage: true }), scrollY: -1 })
    await overviewPage.close()

    return { shots, pageHeight, consoleErrors, sectionRects, horizontalOverflow, horizontalVoids, verticalVoids, contrastFailures, containerBleeds }
  } finally {
    await browser.close()
  }
}
