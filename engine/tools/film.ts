/**
 * FILM — record a page's motion and cut it into frames I can actually look at.
 *
 * WHY
 *
 * I receive still images, never a video stream, so I cannot watch an animation the way a person
 * does. What I can do is look at a sequence of stills. This records the real page in a real browser
 * (where requestAnimationFrame genuinely runs, unlike the hidden preview tab that has cost this repo
 * so much time) and cuts the recording into frames, so motion becomes something inspectable.
 *
 * It is deliberately LOCAL: playwright-core drives the machine's own Edge and ffmpeg does the
 * cutting, both already installed. No third-party service, no upload, no credits, and it works on
 * localhost pages that a hosted analyser could never reach.
 *
 * Two capture modes, because the two questions are different:
 *   - 'scroll'  drives the page from top to bottom over `seconds`, for scroll-driven choreography
 *   - 'hold'    stays at one scroll offset, for autoplaying motion (marquees, loops, hover states)
 *
 * Usage:
 *   npx tsx engine/tools/film.ts <url> [--seconds 6] [--frames 12] [--mode scroll|hold] [--at 0.5]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { findBrowser } from '../agent/see.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface FilmOpts {
  url: string
  seconds: number
  frames: number
  mode: 'scroll' | 'hold'
  /** for 'hold': where to sit, as a fraction of page height */
  at: number
  width: number
  height: number
}

export async function film(o: FilmOpts): Promise<{ dir: string; frames: string[] }> {
  const exe = findBrowser()
  if (!exe) throw new Error('no Chromium-family browser found')

  const slug = o.url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)
  const dir = join(ROOT, 'logs', 'film', slug)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const browser = await chromium.launch({ executablePath: exe, headless: true })
  // recordVideo captures the real compositor output, so CSS animations, transitions and JS tweens
  // all appear exactly as they would to a viewer.
  const ctx = await browser.newContext({
    viewport: { width: o.width, height: o.height },
    recordVideo: { dir, size: { width: o.width, height: o.height } }
  })
  const page = await ctx.newPage()
  await page.goto(o.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(700) // let fonts and first paint settle

  const pageHeight = (await page.evaluate('document.documentElement.scrollHeight')) as number
  const steps = Math.max(12, o.seconds * 12) // ~12 driving steps per second
  const stepMs = Math.round((o.seconds * 1000) / steps)

  if (o.mode === 'hold') {
    await page.evaluate(`window.scrollTo(0, ${Math.round(o.at * Math.max(0, pageHeight - o.height))})`)
    await page.waitForTimeout(o.seconds * 1000)
  } else {
    // Ease the scroll rather than jumping: a linear teleport skips the very frames that carry the
    // choreography, which is exactly what we are trying to see.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      await page.evaluate(`window.scrollTo(0, ${Math.round(eased * Math.max(0, pageHeight - o.height))})`)
      await page.waitForTimeout(stepMs)
    }
  }

  await ctx.close() // flushes the video file
  await browser.close()

  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('no video produced')

  // Cut evenly across the clip. Even sampling beats scene detection here: a smooth animation has no
  // "scenes", and the interesting part is the continuity between frames, not the cuts.
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', join(dir, webm), '-vf', `fps=${(o.frames / o.seconds).toFixed(3)},scale=${o.width}:-1`, '-frames:v', String(o.frames), join(dir, 'frame-%02d.png')],
    { encoding: 'utf8' }
  )
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? '').slice(-300)}`)

  const frames = readdirSync(dir).filter((f) => f.startsWith('frame-') && f.endsWith('.png')).sort()
  return { dir, frames }
}

// ---- CLI ----
const argv = process.argv.slice(2)
if (argv.length && !argv[0]!.startsWith('--')) {
  const flag = (name: string, dflt: string): string => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : dflt
  }
  const opts: FilmOpts = {
    url: argv[0]!,
    seconds: Number(flag('seconds', '6')),
    frames: Number(flag('frames', '12')),
    mode: (flag('mode', 'scroll') as 'scroll' | 'hold'),
    at: Number(flag('at', '0.35')),
    width: Number(flag('width', '1440')),
    height: Number(flag('height', '900'))
  }
  film(opts)
    .then(({ dir, frames }) => {
      console.log(`\n${frames.length} frames -> ${dir}`)
      for (const f of frames) console.log(`  ${join(dir, f)}`)
    })
    .catch((e) => {
      console.error('film failed:', (e as Error).message)
      process.exit(1)
    })
}
