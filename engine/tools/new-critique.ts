/**
 * Scaffold a critique for a real site. Writes the JSON skeleton with what_works / why /
 * tags left EMPTY for you to fill by hand — that judgment is the whole point of the file
 * and is not something to autogenerate.
 *
 *   npm run new:critique -- --url https://landonorris.com
 *   npm run new:critique -- --url https://linear.app --site "Linear" --screenshot ~/shots/linear.png
 *
 * Deliberately does NOT ingest: an unfilled scaffold has nothing to embed, and the
 * ingester refuses it (SkipFile) so it can't poison the index. Once you've filled it in:
 *
 *   npm run ingest:file -- knowledge/critiques/<slug>.json
 */

import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { KNOWLEDGE, rel } from '../ingest/build.js'
import type { CritiqueDoc } from '../types.js'

interface Args {
  url?: string
  site?: string
  screenshot?: string
  force: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { force: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = (): string => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${flag} needs a value`)
      return v
    }
    switch (flag) {
      case '--url': a.url = next(); break
      case '--site': a.site = next(); break
      case '--screenshot': a.screenshot = next(); break
      case '--force': a.force = true; break
      default: throw new Error(`unknown flag: ${flag}`)
    }
  }
  return a
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** "https://www.landonorris.com/x" → "landonorris.com" */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    throw new Error(`--url must be a full URL, e.g. https://landonorris.com`)
  }
}

function main(): void {
  const a = parseArgs(process.argv.slice(2))
  if (!a.url) {
    console.error('Usage: npm run new:critique -- --url https://site.com [--site "Name"] [--screenshot ./shot.png]')
    process.exit(1)
  }

  const host = hostOf(a.url)
  const site = a.site?.trim() || host
  const slug = slugify(a.site?.trim() || host)
  const outPath = join(KNOWLEDGE, 'critiques', `${slug}.json`)

  if (existsSync(outPath) && !a.force) {
    console.error(`${rel(outPath)} already exists. Pass --force to overwrite.`)
    process.exit(1)
  }

  // Copy the screenshot into the knowledge base so the critique is self-contained.
  let screenshotRef = ''
  if (a.screenshot) {
    const src = resolve(a.screenshot)
    if (!existsSync(src)) {
      console.error(`No such screenshot: ${a.screenshot}`)
      process.exit(1)
    }
    const ext = extname(src) || '.png'
    const destName = `${slug}${ext}`
    copyFileSync(src, join(KNOWLEDGE, 'media-refs', destName))
    screenshotRef = `/media-refs/${destName}`
    console.log(`copied screenshot → knowledge/media-refs/${destName}`)
  } else {
    // Still record where it should live, so the field isn't silently dropped.
    screenshotRef = `/media-refs/${slug}.png`
  }

  const doc: CritiqueDoc = {
    site,
    url: a.url,
    screenshot: screenshotRef,
    observations: [{ what: '', why: '' }],
    throughline: '',
    tags: []
  }
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

  console.log(`\nwrote ${rel(outPath)}\n`)
  console.log('Now fill it in by hand:')
  console.log('  observations[]  one entry per pointable thing on the site:')
  console.log('     what   the concrete, specific observation (what you can point at)')
  console.log('     why    the principle behind it — the valuable half, and the part the')
  console.log('            model cannot derive. OMIT it rather than invent one.')
  console.log('  throughline     the overarching insight that maps to no single technique')
  console.log('  tags            mood + technique, e.g. ["motorsport","video-bg","scroll-motion"]')
  console.log('\nEach observation becomes its own retrievable vector — so keep each `what`')
  console.log('to one idea. Cramming three techniques into one entry makes all three unfindable.')
  console.log(`\nThen:  npm run ingest:file -- ${rel(outPath)}`)
  console.log('(ingest refuses the scaffold until at least one observation has a `what`)')
}

try {
  main()
} catch (err) {
  console.error(`\nnew:critique failed: ${(err as Error).message}`)
  process.exit(1)
}
