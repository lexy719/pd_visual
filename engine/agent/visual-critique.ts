/**
 * The visual pass — render → screenshot → critique → revise. The pipeline finally SEES its output.
 *
 * Discipline (each rule earned by a false alarm or a shipped defect this project already hit):
 *  - The critic reports only what is LITERALLY VISIBLE, localized to a shot + section, with concrete
 *    evidence. Inference from artifacts is how this project once mis-diagnosed a healthy run.
 *  - Only blocking/major defects trigger regeneration; taste opinions are capped at `minor` and
 *    never touch code. At most MAX_REVISED sections regenerate, exactly ONE revise pass.
 *  - Accept-if-better: a revision ships only if the re-critique finds that section improved;
 *    otherwise the original code is restored. A wrong critique can waste a call, never worsen a page.
 *  - Ship-with-warning: surviving blocking defects are surfaced loudly, the pipeline never blocks.
 *  - Every screenshot + critique is saved under logs/visual/<stamp>/ — evidence, not mystery.
 *
 * Gated by DESIGN_VISUAL_PASS ('off' disables). Independent of the image pre-warm gate.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { completeVision, completeReasoning, extractJson, extractCode } from '../llm/llm.js'
import { capturePage, serveDir, findBrowser, type CaptureResult } from './see.js'
import { parseError } from './writer.js'
import type { Plan, SectionResult } from './types.js'

export interface VisualDefect {
  sectionIndex: number
  defectClass: string
  severity: 'blocking' | 'major' | 'minor'
  /** what is literally visible and where — "spec table clipped at right edge in viewport-1510" */
  evidence: string
  fix: string
}

export interface VisualReport {
  ran: boolean
  defectsBefore: VisualDefect[]
  defectsAfter: VisualDefect[]
  revisedSections: number[]
  restoredSections: number[]
  /** blocking/major defects that survived the pass — ship-with-warning payload */
  surviving: VisualDefect[]
  shotsDir: string
}

const DEFECT_CLASSES = [
  'broken-image', // empty/failed image slot, alt-text icon, bare gray box
  'overflow', // content clipped or bleeding past the viewport / its container
  'collision', // elements overlapping or text rendered over text
  'contrast', // text not readable against its background
  'crash', // an error-boundary message visible on the page
  'dead-zone', // a large purposeless empty area that reads as a bug, not whitespace
  'duplicate', // two sections visually near-identical
  'taste' // holistic judgment — NEVER above minor
] as const

const SEVERITIES = new Set(['blocking', 'major', 'minor'])
const MAX_REVISED = 3

const CRITIC_SYSTEM = `You are the VISUAL CRITIC of a web-design pipeline, looking at screenshots of a page it just built.
Report ONLY defects you can literally SEE in the screenshots — never inferences about code or intent.
Respond with ONLY JSON:

{ "defects": [ { "sectionIndex": <int>, "defectClass": "<${DEFECT_CLASSES.join(' | ')}>",
    "severity": "<blocking | major | minor>",
    "evidence": "<what is visible and WHERE: cite the screenshot label and the location in it>",
    "fix": "<one concrete instruction for regenerating that section>" } ] }

RULES:
- Use the SECTION MAP to convert a screenshot position to the right sectionIndex.
- Every defect MUST cite its screenshot label in "evidence". A defect you cannot point at does not exist.
- severity: "blocking" = the page is visibly broken there (crash text, clipped/unreadable content,
  overlapping text, an obviously empty image slot). "major" = clearly wrong but content survives.
  "minor" = judgment/taste. "taste" is ALWAYS minor. "dead-zone" is MAJOR when roughly a full
  viewport (or more) is effectively empty — that is a layout failure, not breathing room; smaller
  intentional whitespace stays minor.
- An EMPTY tinted/bordered panel WITH a caption is a "broken-image" defect (major) — a caption
  promises a subject, and an empty framed rectangle reads as a loading failure, never as restraint.
- Do NOT flag: image subject choice or art style (imagery is generated and staged elsewhere);
  whitespace that reads as intentional pacing (unframed, uncaptioned); anything you merely suspect.
- An empty defects array is a good answer when the page is clean. Do not invent findings.`

const digestSectionMap = (
  sections: SectionResult[],
  rects: CaptureResult['sectionRects']
): string =>
  rects
    .map((r) => {
      const s = sections[r.index]
      return `section ${r.index} "${s?.name ?? '?'}" (${s?.composition ?? '?'}) — page y ${r.top} to ${r.top + r.height}`
    })
    .join('\n')

/** Build the preview app once (same command the studio snapshot uses). Returns null on failure. */
export function buildPreview(appDir: string): string | null {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const out = spawnSync(npm, ['--prefix', appDir, 'run', 'build'], { encoding: 'utf8', shell: true, timeout: 180000 })
  if (out.status !== 0) {
    console.warn(`  \x1b[33m⚠ visual pass: vite build failed — skipping.\x1b[0m ${(out.stderr || '').slice(-200)}`)
    return null
  }
  return join(appDir, 'dist')
}

async function critique(
  dist: string,
  sections: SectionResult[],
  plan: Plan,
  shotsDir: string,
  tag: string
): Promise<{ defects: VisualDefect[]; capture: CaptureResult } | null> {
  const { url, close } = await serveDir(dist)
  try {
    const capture = await capturePage(url)
    mkdirSync(shotsDir, { recursive: true })
    for (const s of capture.shots) writeFileSync(join(shotsDir, `${tag}-${s.label}.png`), s.png)

    const user = `Brand: ${plan.brand} · mood: ${plan.moodProfile}
Explicit avoidances for this brief: ${plan.avoidances.join('; ') || '(none)'}

SECTION MAP (screenshot scroll positions → sections):
${digestSectionMap(sections, capture.sectionRects)}

CONSOLE ERRORS during render (a crash here usually pairs with a visible defect):
${capture.consoleErrors.length ? capture.consoleErrors.map((e) => `- ${e}`).join('\n') : '(none)'}

The screenshots above are viewport captures at the labelled scroll positions plus one full-page overview.
List the visible defects now (empty array if clean).`

    const raw = await completeVision(CRITIC_SYSTEM, user, capture.shots.map((s) => ({ label: s.label, png: s.png })), { maxTokens: 2000 })
    const parsed = extractJson<{ defects?: unknown[] }>(raw)
    const defects: VisualDefect[] = []
    // MEASURED defects first — DOM facts outrank vision. A page wider than its viewport shifts and
    // clips everything; the offender is identified by measurement, so the revise prompt is exact.
    if (capture.horizontalOverflow) {
      const o = capture.horizontalOverflow
      defects.push({
        sectionIndex: Math.max(0, o.sectionIndex),
        defectClass: 'overflow',
        severity: 'blocking',
        evidence: `MEASURED (DOM, not vision): page scrollWidth ${o.scrollWidth}px > viewport ${o.viewport}px; widest offender <${o.offender}> spans x ${o.offenderLeft}..${o.offenderRight}`,
        fix: `constrain <${o.offender}> inside the container — remove fixed widths / column overflow so nothing exceeds the viewport`
      })
    }
    // MEASURED container bleed — an image escaping its own card (invisible to the viewport check).
    for (const b of capture.containerBleeds ?? []) {
      defects.push({
        sectionIndex: Math.max(0, b.sectionIndex),
        defectClass: 'overflow',
        severity: 'major',
        evidence: `MEASURED (DOM, not vision): <${b.element}> extends ${b.overflowPx}px past its container <${b.container}> on the ${b.side}.`,
        fix: `The image is wider than the card holding it. Make it fit its container: give the image w-full (and the locked shot-* aspect class) so it scales to the card, or let the card clip it with overflow-hidden plus rounded corners matching the card. Do NOT widen the card or use a fixed pixel width larger than its column.`
      })
    }

    // MEASURED horizontal voids — names the MECHANISM per shape so the revise gets a real structural
    // handle (the earlier "fix this empty space" instruction had none).
    for (const v of capture.horizontalVoids ?? []) {
      const fix =
        v.kind === 'unequal-columns'
          ? `CAUSE: ${v.detail}. Because the short column is genuinely sparse, STOP putting them side by side: make this block a SINGLE full-width column (stack the short content above/below the tall element, each full width). Do NOT switch to items-stretch (stretching a near-empty column just makes a taller void) and do NOT invent filler. Two columns → one.`
          : `CAUSE: ${v.detail}. The content is pinned to one side of a full-width container. FIX by making the content actually USE its container: either (1) CENTER the content block (mx-auto on a max-w-* wrapper so the empty band becomes balanced margins, not one big void), or (2) genuinely fill the width with a real two-part layout (text one side, an on-brief image / pull-quote / stat the other — never an empty box). A content column must center or expand to its container by DEFAULT; it must never sit pinned to one edge with a tall empty band beside it.`
      defects.push({
        sectionIndex: Math.max(0, v.sectionIndex),
        defectClass: 'dead-zone',
        severity: 'major',
        evidence: `MEASURED (DOM, not vision): ${v.kind} in <${v.rowClass}> — ${v.detail}.`,
        fix
      })
    }
    // MEASURED VERTICAL voids. Blocking when the band is enormous, because a reader scrolling
    // through a screen and a half of nothing has left. Vision-reported dead zones are capped at
    // `major` and therefore ship; this is DOM fact, so it is allowed to stop the page.
    // Pinned sections are excluded upstream (see.ts) because their DOM geometry lies about what the
    // reader sees, so everything arriving here is a genuinely over-tall section.
    for (const v of capture.verticalVoids ?? []) {
      defects.push({
        sectionIndex: Math.max(0, v.sectionIndex),
        defectClass: 'dead-zone',
        severity: v.biggestGapPx >= 900 || v.inkPct < 15 ? 'blocking' : 'major',
        evidence: `MEASURED (DOM, not vision): ${v.detail}.`,
        fix: `CAUSE: the section is far taller than its content needs, so the reader scrolls through ${v.biggestGapPx}px of nothing. FIX by REMOVING HEIGHT, not by adding filler: delete any min-h-screen/h-[..vh] on this section, drop fixed heights on wrappers, and let the locked section-pad provide the air. Never insert decorative boxes or invented copy to fill it — an empty band and a filler band are the same defect.`
      })
    }
    for (const d of parsed.defects ?? []) {
      const x = d as Partial<VisualDefect>
      const idx = Number(x.sectionIndex)
      if (!Number.isInteger(idx) || idx < 0 || idx >= sections.length) continue
      if (!SEVERITIES.has(String(x.severity))) continue
      const cls = String(x.defectClass ?? 'taste')
      let severity = x.severity as VisualDefect['severity']
      // hard caps: taste never drives regeneration; dead-zone caps at major (a full-viewport void
      // IS actionable — it was the user's exact complaint — but never "blocking")
      if (cls === 'taste' && severity !== 'minor') severity = 'minor'
      if (cls === 'dead-zone' && severity === 'blocking') severity = 'major'
      defects.push({
        sectionIndex: idx,
        defectClass: cls,
        severity,
        evidence: String(x.evidence ?? '').slice(0, 300),
        fix: String(x.fix ?? '').slice(0, 300)
      })
    }
    writeFileSync(join(shotsDir, `${tag}-critique.json`), JSON.stringify(defects, null, 2))
    return { defects, capture }
  } catch (e) {
    console.warn(`  \x1b[33m⚠ visual pass (${tag}) failed: ${(e as Error).message}\x1b[0m`)
    return null
  } finally {
    close()
  }
}

const REVISE_SYSTEM = `You are revising ONE React section of a generated page. A visual critic looked at the RENDERED
page and found concrete defects in this section. Fix EXACTLY those defects — this is surgery, not a redesign.
Rules:
- Keep the same imports, structure, copy and image URLs unless a defect explicitly implicates them.
- Keep the locked classes (section-pad / container-page / mi utilities / theme tokens) intact.
- Output ONLY the complete corrected file (imports + one export default function). No prose, no fences.`

async function reviseSection(s: SectionResult, defects: VisualDefect[], plan: Plan): Promise<string | null> {
  const user = `Brand: ${plan.brand} · mood: ${plan.moodProfile}
Section ${s.index} "${s.name}" (${s.composition}).

VISUAL DEFECTS the critic saw on the rendered page (fix all of these, change nothing else):
${defects.map((d) => `- [${d.severity}/${d.defectClass}] ${d.evidence} → ${d.fix}`).join('\n')}

CURRENT CODE:
${s.code}`
  try {
    const out = extractCode(await completeReasoning(REVISE_SYSTEM, user, { maxTokens: 5000 }))
    return parseError(out) ? null : out
  } catch {
    return null
  }
}

const isActionable = (d: VisualDefect): boolean => d.severity === 'blocking' || d.severity === 'major'

/**
 * The full pass. Mutates section code in place (accepted revisions only); the caller re-writes the
 * page afterwards. Returns the report; `ran: false` means gated off or infrastructure unavailable.
 */
export async function visualPass(
  plan: Plan,
  sections: SectionResult[],
  appDir: string,
  writeBack: () => void,
  log: (m: string) => void = console.log
): Promise<VisualReport> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const shotsDir = join('logs', 'visual', stamp)
  const empty: VisualReport = { ran: false, defectsBefore: [], defectsAfter: [], revisedSections: [], restoredSections: [], surviving: [], shotsDir }

  if ((process.env.DESIGN_VISUAL_PASS ?? 'on').toLowerCase() === 'off') return empty
  if (!findBrowser()) {
    log('       ↳ visual pass skipped: no system browser for headless capture')
    return empty
  }

  const dist = buildPreview(appDir)
  if (!dist) return empty

  const first = await critique(dist, sections, plan, shotsDir, 'before')
  if (!first) return empty
  const before = first.defects
  const actionable = before.filter(isActionable)
  log(`       ↳ visual critique: ${before.length} defect(s) — ${actionable.length} actionable (${before.filter((d) => d.severity === 'minor').length} minor)`)
  for (const d of before) log(`         [${d.severity}] s${d.sectionIndex} ${d.defectClass}: ${d.evidence.slice(0, 110)}`)

  if (!actionable.length) {
    return { ...empty, ran: true, defectsBefore: before, defectsAfter: before, surviving: [] }
  }

  // Revise the worst sections — blocking first, capped.
  const bySection = new Map<number, VisualDefect[]>()
  for (const d of actionable) bySection.set(d.sectionIndex, [...(bySection.get(d.sectionIndex) ?? []), d])
  const targets = [...bySection.entries()]
    .sort((a, b) => b[1].filter((d) => d.severity === 'blocking').length - a[1].filter((d) => d.severity === 'blocking').length)
    .slice(0, MAX_REVISED)

  const originals = new Map<number, string>()
  const revisedSections: number[] = []
  for (const [idx, defects] of targets) {
    const s = sections.find((x) => x.index === idx)
    if (!s) continue
    const revised = await reviseSection(s, defects, plan)
    if (revised) {
      originals.set(idx, s.code)
      s.code = revised
      revisedSections.push(idx)
      log(`       ↳ revised section ${idx} (${defects.length} defect(s))`)
    } else {
      log(`       ↳ section ${idx} revision failed to parse — keeping the original`)
    }
  }

  if (!revisedSections.length) {
    return { ...empty, ran: true, defectsBefore: before, defectsAfter: before, surviving: actionable }
  }

  // Re-render, re-critique, accept-if-better PER SECTION.
  writeBack()
  const dist2 = buildPreview(appDir)
  const second = dist2 ? await critique(dist2, sections, plan, shotsDir, 'after') : null
  const restoredSections: number[] = []
  let after = second?.defects ?? before

  if (second) {
    const count = (list: VisualDefect[], idx: number): number => list.filter((d) => d.sectionIndex === idx && isActionable(d)).length
    for (const idx of revisedSections) {
      if (count(second.defects, idx) >= count(before, idx)) {
        const orig = originals.get(idx)
        const s = sections.find((x) => x.index === idx)
        if (orig && s) {
          s.code = orig
          restoredSections.push(idx)
          log(`       ↳ section ${idx} did not improve on re-critique — original restored`)
        }
      } else {
        log(`       ↳ section ${idx} improved: ${count(before, idx)} → ${count(second.defects, idx)} actionable defect(s)`)
      }
    }
    if (restoredSections.length) {
      writeBack()
      buildPreview(appDir) // final state must be what ships
    }
  } else {
    // re-critique unavailable — never ship unverified revisions
    for (const idx of revisedSections) {
      const orig = originals.get(idx)
      const s = sections.find((x) => x.index === idx)
      if (orig && s) { s.code = orig; restoredSections.push(idx) }
    }
    writeBack()
    after = before
    log('       ↳ re-critique unavailable — all revisions restored (never ship unverified changes)')
  }

  const surviving = after.filter(isActionable)
  return {
    ran: true,
    defectsBefore: before,
    defectsAfter: after,
    revisedSections: revisedSections.filter((i) => !restoredSections.includes(i)),
    restoredSections,
    surviving,
    shotsDir
  }
}
