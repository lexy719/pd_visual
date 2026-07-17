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

export interface CaptureResult {
  shots: PageShot[]
  pageHeight: number
  consoleErrors: string[]
  /** top-level section geometry, so a critic can map a shot's scroll range to section indexes */
  sectionRects: SectionRect[]
  /** set when the page is wider than the viewport — an automatic blocking defect, no vision needed */
  horizontalOverflow: HorizontalOverflow | null
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

    return { shots, pageHeight, consoleErrors, sectionRects, horizontalOverflow }
  } finally {
    await browser.close()
  }
}
