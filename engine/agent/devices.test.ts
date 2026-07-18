/**
 * Device-library integrity.
 *
 * A device only works if all three of its parts exist: the CSS that makes the geometry real, the
 * knowledge chunk that teaches a section WHEN to reach for it, and membership in DEVICE_NAMES so the
 * flatness lint counts it as a device. Miss the CSS and the class is inert; miss the chunk and the
 * device is never retrieved and so never chosen; miss the name and the lint demands a device from a
 * section that already has one.
 *
 * These were three separate lists until devices.ts merged them. This test is what keeps them merged.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICE_NAMES, DEVICE_CSS, DEVICE_RE, DEFAULT_DEVICE } from './devices.js'
import { COMPOSITIONS } from '../types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KNOWLEDGE = readFileSync(join(ROOT, 'knowledge', 'guidelines', 'devices.md'), 'utf8')

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

console.log('\ndevice library integrity\n')

for (const d of DEVICE_NAMES) {
  check(`${d} — has CSS`, DEVICE_CSS.includes(`.${d} `) || DEVICE_CSS.includes(`.${d}{`) || DEVICE_CSS.includes(`.${d},`))
  check(`${d} — has a knowledge chunk`, KNOWLEDGE.includes(`## Device: ${d} `))
  check(`${d} — the flatness lint recognises it`, DEVICE_RE.test(`<div className="${d}">`))
}

// Every chunk must be tagged, or plan()'s tag-gated retrieval cannot see it (CLAUDE.md).
for (const block of KNOWLEDGE.split(/\n## /).slice(1)) {
  const title = block.split('\n')[0]!.trim()
  check(`chunk "${title.slice(0, 34)}" is tagged`, /\ntags:\s*\S/.test(`\n${block}`))
}

// A chunk documenting a device that no longer exists would teach the model to emit a dead class.
const documented = [...KNOWLEDGE.matchAll(/## Device: (dev-[a-z-]+)/g)].map((m) => m[1]!)
for (const d of documented) {
  check(`documented ${d} is a real device`, (DEVICE_NAMES as readonly string[]).includes(d))
}

// Every composition needs a fallback device, or the flatness escalation has nothing to suggest.
for (const c of COMPOSITIONS) {
  const d = DEFAULT_DEVICE[c]
  check(`composition "${c}" has a default device`, !!d && (DEVICE_NAMES as readonly string[]).includes(d))
}

// The lint must not fire on a section that already carries a device, and must fire on one that
// doesn't — the regression that made the whole library unenforceable.
check('DEVICE_RE ignores a non-device class', !DEVICE_RE.test('<div className="developer-note rounded-xl">'))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — device library consistent\n')
process.exit(failed ? 1 : 0)
