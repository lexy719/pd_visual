/**
 * Emitted-CSS integrity.
 *
 * THE BUG THIS EXISTS FOR
 *
 * A comment in themeCss contained the text `py-*​/max-w-*`. The `*` followed by `/` closed the CSS
 * comment early, and the remaining prose plus the real `*​/` was then parsed as a selector — which
 * swallowed the rule immediately after it. That rule was `.container-page`, the locked content width
 * for the entire page.
 *
 * So every page ever generated ran with NO container: sections sprawled to the full viewport, and
 * the layout complaints that had been blamed on the model's composition were a single stray slash in
 * a comment. Nothing failed. The source file read perfectly. globals.css contained the rule. Only the
 * browser's parsed stylesheet knew, and nothing was asking it.
 *
 * The lesson generalises past this one typo: any text interpolated into emitted CSS can terminate a
 * comment or a block, and the damage lands on a DIFFERENT rule than the one containing the mistake.
 * So this test parses what is emitted rather than trusting that it looks right.
 */
import { themeCss } from './writer.js'
import type { InteractionSpec, LayoutSpec, Palette, TypographySpec } from './art-direction.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

const PALETTE: Palette = {
  background: '#FAF7F2', foreground: '#14181F', card: '#FFFFFF', cardForeground: '#14181F',
  primary: '#2F3A45', primaryForeground: '#FFFFFF', secondary: '#EDE7DE', mutedForeground: '#6B7480',
  border: '#E2E6EA', accent: '#8A5A2B', accentForeground: '#FFFFFF'
}
const MI: InteractionSpec = { durationMs: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', hoverTransform: 'translateY(-2px)', hoverShadow: 'none', tapScale: 0.98, cursor: 'pointer' }
const TYPE: TypographySpec = {
  displayStack: 'serif', displayFamily: 'Georgia, serif', bodyStack: 'grotesque', bodyFamily: 'system-ui, sans-serif',
  scaleRatio: 1.33, displayWeight: 500, bodyWeight: 400, displayTracking: '-0.01em', displayLineHeight: 1.1,
  bodyLineHeight: 1.6, pairing: 'test'
}
const LAYOUT: LayoutSpec = { containerPx: 1088, sectionPadMin: 156, sectionPadMax: 215 }

const css = themeCss(PALETTE, MI, TYPE, LAYOUT, 'smooth', 'calm')

/**
 * Strip CSS comments the way a parser does — earliest `*​/` closes the comment. If a comment
 * terminates early, the leftover prose stays in the output and is visible to the assertions below.
 */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '')
const body = stripComments(css)

console.log('\nemitted theme css\n')

// 1. No comment may close early. After correct stripping there must be no stray terminator left.
check('no stray comment terminator survives stripping', !body.includes('*/'), body.slice(Math.max(0, body.indexOf('*/') - 90), body.indexOf('*/') + 10))
check('comment open/close counts match', (css.match(/\/\*/g) ?? []).length === (css.match(/\*\//g) ?? []).length)

// 2. Braces must balance, or a block is swallowing whatever follows it.
const opens = (body.match(/\{/g) ?? []).length
const closes = (body.match(/\}/g) ?? []).length
check('braces balance', opens === closes, `${opens} open vs ${closes} close`)

// 3. Every locked rule must SURVIVE comment stripping — the actual regression.
//    Checked against the stripped body, because the original text contains them either way.
const REQUIRED = [
  '.container-page', '.section-pad', '.section-pad-hero',
  '.dev-overlap', '.dev-quote-break', '.dev-bleed', '.dev-feature-grid', '.dev-price-table',
  '.rhythm-tight', '.rhythm-open', '.vol-loud', '.reveal',
  '.mi', 'html.lenis', '@keyframes reveal-rise'
]
for (const sel of REQUIRED) check(`${sel} survives into the stylesheet`, body.includes(sel))

// 4. The locked values must actually reach the custom properties.
check('--container carries the layout width', body.includes(`--container: ${LAYOUT.containerPx}px`))
check('--section-pad carries the padding rhythm', body.includes(`${LAYOUT.sectionPadMin}px`))
check('.container-page consumes --container', /\.container-page\s*\{[^}]*max-width:\s*var\(--container\)/.test(body))
check('.container-page centres itself', /\.container-page\s*\{[^}]*margin-inline:\s*auto/.test(body))

// 5. A rule must not be preceded by orphaned prose — the signature of the original bug.
const orphan = body.match(/\n\s*[a-z][a-z -]{18,}\n\s*\.[a-z-]+\s*\{/i)
check('no orphaned prose immediately before a rule', !orphan, orphan?.[0]?.slice(0, 80))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — emitted css intact\n')
process.exit(failed ? 1 : 0)
