/**
 * Retrieval quality gate. Hand-written queries with the doc_id we EXPECT to surface.
 *
 *   npm run eval
 *
 * This is the phase-1 exit criterion: do not build the generation agent until this
 * passes convincingly. Edit CASES as you add real components/critiques — a query set
 * that only matches your seed data proves nothing.
 *
 * Component cases run with `kind: 'component'` + `framework: 'react'` because that is
 * exactly what `retrieveForSection()` does in production. Unfiltered, the 60 guideline
 * chunks outrank the 5 components — which is correct behaviour, but not what we're testing.
 *
 * Queries are written the way a person would actually type them: describe the BEHAVIOUR,
 * never echo the component's name or tags. "carousel of cards" tests nothing; the word
 * "carousel" is already in the tags.
 */

import { queryKnowledge } from './query.js'
import type { DocKind, Framework } from '../types.js'

interface Case {
  q: string
  /** substring of the doc_id (or name) that should appear in the top-k */
  expect: string
  kind?: DocKind
  framework?: Framework
  k?: number
}

const CASES: Case[] = [
  // --- components (5 real components, 6 cases: nav-002 is probed from two angles) ---
  {
    q: 'a horizontal track of cards you can scroll sideways, tap one to open the full story',
    expect: 'card-001',
    kind: 'component',
    framework: 'react'
  },
  {
    q: 'a vertical list of rows where clicking one expands it into a modal with the same image',
    expect: 'card-002',
    kind: 'component',
    framework: 'react'
  },
  {
    q: 'navigation that hides when you scroll down and comes back when you scroll up',
    expect: 'nav-002',
    kind: 'component',
    framework: 'react'
  },
  {
    q: 'a small pill-shaped menu that floats at the top of the page',
    expect: 'nav-002',
    kind: 'component',
    framework: 'react'
  },
  {
    q: 'full screen intro with an animated background and a moving strip of tech logos',
    expect: 'hero-003',
    kind: 'component',
    framework: 'react'
  },
  {
    q: 'the video starts small and grows to fill the screen as you scroll down',
    expect: 'hero-004',
    kind: 'component',
    framework: 'react'
  },

  // --- guidelines / critiques / media-refs (unchanged — these already pass) ---
  { q: 'what colours for an aggressive racing brand', expect: 'color-theory', kind: 'guideline' },
  { q: 'how big should the jump be between heading and body text', expect: 'typography', kind: 'guideline' },
  { q: 'how much padding between sections', expect: 'spacing', kind: 'guideline' },
  { q: 'scroll triggered animation that reinforces the brand', expect: 'motion-patterns', kind: 'guideline' },
  { q: 'text contrast ratio requirements', expect: 'accessibility', kind: 'guideline' },
  { q: 'keeping text legible on top of a video background', expect: 'lando', kind: 'critique' },
  { q: 'restrained minimal dark product site with subtle gradients', expect: 'linear', kind: 'critique' },
  { q: 'where do I get photos for the generated site', expect: 'sourcing', kind: 'media-ref' },
  { q: 'a scroll narrative where each visual chapter has a purpose', expect: 'cinematic-scroll-story', kind: 'guideline' },
  { q: 'when should a video hero be used instead of a still image', expect: 'video-hero', kind: 'guideline' },
  { q: 'avoid making visitors wait for autoplay video or scroll-jacking', expect: 'cinematic-storytelling', kind: 'guideline' }
]

async function main(): Promise<void> {
  let pass = 0
  console.log(`\nRunning ${CASES.length} retrieval cases…\n`)

  for (const c of CASES) {
    const k = c.k ?? 3
    const hits = await queryKnowledge(c.q, { k, kind: c.kind, framework: c.framework })
    const needle = c.expect.toLowerCase()
    const rank = hits.findIndex(
      (h) => h.doc_id.toLowerCase().includes(needle) || h.name.toLowerCase().includes(needle)
    )
    const ok = rank !== -1
    if (ok) pass++
    const top = hits[0]
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${ok ? `@${rank + 1}` : '  '}  ${c.q.slice(0, 52).padEnd(54)} ` +
        `→ ${top ? `${top.doc_id.slice(0, 28)} (${top.score.toFixed(2)})` : '(no hits)'}`
    )
    if (!ok && hits.length) {
      console.log(`        expected "${c.expect}" in top ${k}; got: ${hits.map((h) => h.doc_id).join(', ')}`)
    }
  }

  const pct = Math.round((pass / CASES.length) * 100)
  console.log(`\n${pass}/${CASES.length} passed (${pct}%)`)
  if (pct < 80) {
    console.log('Retrieval is weak. Fix embed_text / tags / chunking BEFORE building the agent.')
    process.exit(1)
  }
  console.log('Retrieval looks healthy. Safe to move on to the generation agent.')
}

main().catch((err) => {
  console.error(`\nEval failed: ${(err as Error).message}`)
  process.exit(1)
})
