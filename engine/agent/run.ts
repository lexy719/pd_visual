/**
 * Generation agent CLI. Headless, terminal-driven.
 *
 *   npm run generate -- "landing page for a motorsport energy drink"
 *   npm run generate -- "..." --no-serve      (write the page, don't start Vite)
 *
 * Pipeline: plan → retrieve+generate (per section) → self-critique → write into the Vite app → serve.
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { describeRhythm } from './rhythm.js'
import { describeKit } from './kit.js'
import { describeSurface } from './surface.js'
import { plan } from './plan.js'
import { artDirect } from './art-direction.js'
import { generateSections } from './generate.js'
import { buildWireframe, renderWireframe, writePlanPreference } from './wireframe.js'
import { critique } from './critique.js'
import { writePage, APP } from './writer.js'
import { visualPass } from './visual-critique.js'
import { hexToRgb } from './color.js'
import { LLM_MODEL, REASONING_MODEL, BULK_MODEL } from '../llm/llm.js'

/** A truecolor terminal swatch so the palette is visible in the run log. */
const swatch = (hex: string): string => {
  const rgb = hexToRgb(hex)
  return rgb ? `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m   \x1b[0m ${hex}` : hex
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const rule = (t: string): void => console.log(`\n\x1b[1m── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}\x1b[0m`)

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const noServe = args.includes('--no-serve')
  const noCritique = args.includes('--no-critique')
  const autoApprove = args.includes('--yes')
  const brief = args.filter((a) => !a.startsWith('--')).join(' ').trim()
  if (!brief) {
    console.error('usage: npm run generate -- "<one-line brief>" [--no-serve]')
    process.exit(1)
  }

  console.log(`\nbrief:      "${brief}"`)
  console.log(`reasoning:  ${REASONING_MODEL}   (questions · concept · plan · art-direction)`)
  console.log(`bulk:       ${BULK_MODEL}   (section codegen · self-critique; escalates to reasoning on repair)`)
  console.log(`design:     ${LLM_MODEL}   (legacy/fallback tier)`)

  // 1. PLAN
  rule('PLAN')
  const p = await plan(brief)
  console.log(`brand:  ${p.brand}`)
  console.log(`mood:   ${p.mood.join(', ')}`)
  console.log(`layout: ${p.layoutPatterns?.join(', ') || '(none retrieved)'}`)
  console.log(`sections:`)
  p.sections.forEach((s, i) =>
    console.log(`  ${i}. ${s.name.padEnd(16)} \x1b[36m${s.composition}\x1b[0m/${s.emphasis}  ${s.intent}`)
  )

  // 1b. ART-DIRECTION — one locked palette for the whole run.
  rule('ART-DIRECTION  (retrieve color rules + critiques → committed palette)')
  const art = await artDirect(p, (m) => console.log(`\x1b[2m${m}\x1b[0m`))
  const pal = art.palette
  console.log(`  primary   ${swatch(pal.primary)}`)
  console.log(`  accent    ${swatch(pal.accent)}`)
  console.log(`  bg / fg   ${swatch(pal.background)}  /  ${swatch(pal.foreground)}`)
  console.log(`  card/bord ${swatch(pal.card)}  /  ${swatch(pal.border)}`)
  console.log(`  motion    \x1b[36m${art.motion}\x1b[0m  (locked for the whole run)`)
  console.log(`  rhythm    \x1b[36m${describeRhythm(art.rhythm)}\x1b[0m  (page pacing: ▁tight ▄normal █open)`)
  console.log(`  kit       \x1b[36m${describeKit(art.kit)}\x1b[0m  (this project's own components, emitted as CSS)`)
  console.log(`  \x1b[2m${art.kit.rationale}\x1b[0m`)
  console.log(`  surface   \x1b[36m${describeSurface(art.surface)}\x1b[0m`)
  console.log(`  \x1b[2m${art.surface.rationale}\x1b[0m`)
  const mi = art.interactions
  console.log(`  interact  \x1b[36m${mi.durationMs}ms\x1b[0m ${mi.easing}  hover:\x1b[36m${mi.hoverTransform}\x1b[0m  tap:${mi.tapScale}  cursor:${mi.cursor}  (locked)`)
  console.log(`  \x1b[2m${art.rationale}\x1b[0m`)
  console.log(`  \x1b[2manchors: ${art.anchors.join(', ') || '(none)'}\x1b[0m`)
  for (const a of art.adjustments) console.log(`  \x1b[33mADJUSTED\x1b[0m ${a}`)

  // 1c. WIREFRAME APPROVAL — cheap structural preview (retrieval only, no codegen) before spending
  // the expensive ~8-call generation. Reject → log the reason to plan-preferences and stop.
  rule('WIREFRAME  (approve structure before codegen)')
  const wf = await buildWireframe(p, art)
  console.log(renderWireframe(wf))
  if (!autoApprove) {
    const rl = createInterface({ input: stdin, output: stdout })
    const ans = (await rl.question('\n  Approve this structure? [Y]es / [r]eject: ')).trim().toLowerCase()
    if (ans === 'r' || ans === 'reject' || ans === 'n' || ans === 'no') {
      const reason = (await rl.question('  Reason for rejection (stored to improve future plans): ')).trim()
      rl.close()
      const path = await writePlanPreference(p, art, reason || 'structure rejected (no reason given)')
      console.log(`\n  \x1b[33mRejected.\x1b[0m Logged to ${path}.`)
      console.log('  Re-run the same brief — Plan will avoid this structure next time.')
      return
    }
    rl.close()
  }

  // 2 + 3. RETRIEVE + GENERATE
  rule('GENERATE  (retrieve → motion-primitive-or-scratch → code)')
  const gen = await generateSections(p, art, (m) => console.log(m))

  // 4. SELF-CRITIQUE
  rule('SELF-CRITIQUE')
  const findings = noCritique
    ? (console.log('  skipped (--no-critique)'), [])
    : await critique(gen, (m) => console.log(`\x1b[2m${m}\x1b[0m`))
  if (!noCritique && !findings.length) console.log('  no violations flagged.')
  for (const f of findings) {
    const tag = f.severity === 'flag' ? '\x1b[31mFLAG\x1b[0m' : '\x1b[33mwarn\x1b[0m'
    console.log(`  ${tag} [${f.section}] ${f.issue}`)
  }

  // 5. WRITE
  rule('WRITE  → preview/app')
  const w = writePage(p, gen, art)

  // 5b. SEE — render, screenshot, critique, revise (accept-if-better), ship-with-warning.
  const visual = await visualPass(p, gen.sections, APP, () => writePage(p, gen, art))
  if (visual.ran && visual.surviving.length) {
    console.log(`  \x1b[31mVISUAL\x1b[0m shipped WITH ${visual.surviving.length} visible defect(s) after the revise pass:`)
    for (const d of visual.surviving) console.log(`  \x1b[31m      \x1b[0m [${d.severity}] s${d.sectionIndex} ${d.defectClass}: ${d.evidence.slice(0, 100)}`)
    console.log(`  \x1b[31m      \x1b[0m screenshots + critiques: ${visual.shotsDir}`)
  } else if (visual.ran) {
    console.log(`  \x1b[36mVISUAL\x1b[0m clean after visual pass (${visual.defectsBefore.length} finding(s), ${visual.revisedSections.length} section(s) revised)`)
  }
  const motionCount = gen.sections.filter((s) => s.strategy === 'motion-primitive').length
  const scratch = gen.sections.length - motionCount
  console.log(`  ${gen.sections.length} sections  (${motionCount} motion-primitive, ${scratch} from scratch)`)
  console.log(`  primitives: ${[...gen.usedComponents.keys()].join(', ') || '(none)'}`)

  // Tier accounting — the actual cost/quality tradeoff for this run.
  const bulkOnly = gen.sections.filter((s) => s.tier === 'bulk').length
  const escalated = gen.sections.filter((s) => s.tier === 'bulk→escalated').length
  console.log(`  \x1b[36mTIERS\x1b[0m  plan/art-direction/questions: \x1b[35m[reasoning]\x1b[0m ${REASONING_MODEL}`)
  console.log(`         sections: ${bulkOnly} \x1b[36m[bulk]\x1b[0m` + (escalated ? `, ${escalated} \x1b[33m[bulk→escalated]\x1b[0m (repaired on ${REASONING_MODEL})` : ' (none needed escalation)'))
  for (const s of gen.sections) {
    const tag = s.tier === 'bulk→escalated' ? '\x1b[33m[bulk→escalated]\x1b[0m' : '\x1b[36m[bulk]\x1b[0m'
    const stub = s.quarantined ? ' \x1b[31m[QUARANTINED → stub]\x1b[0m' : ''
    console.log(`           [${s.index}] ${s.name}/${s.composition} → ${tag}${stub}`)
  }
  console.log(`  deps:       ${w.deps.join(', ') || '(none)'}`)
  console.log(`  files:      ${w.files.length} written under preview/app/src`)

  // Quarantine: a section that did not parse and was replaced by a visible stub. Reported at the TOP
  // of the lints — it is the most severe outcome a section can have (the page is missing content),
  // and it must never be just a console.warn that scrolled past.
  const stubbed = gen.sections.filter((x) => x.quarantined)
  if (stubbed.length) {
    console.log(
      `  \x1b[31mQUARANTINED\x1b[0m ${stubbed.length}/${gen.sections.length} section(s) did not parse and were replaced with a stub:`
    )
    for (const s of stubbed) {
      const q = s.quarantined!
      const who = q.tiersFailed.length ? `${q.tiersFailed.join(' + ')} failed to parse` : 'generation parsed OK — broken by a writer transform'
      console.log(`  \x1b[31m          \x1b[0m [${s.index}:${s.name}] ${q.error.slice(0, 80)}`)
      console.log(`  \x1b[31m          \x1b[0m   ↳ ${who}${q.evidence ? ` · evidence: ${q.evidence}` : ' · evidence dump FAILED'}`)
    }
  }

  // Motion-primitive tier: which sections got scroll-choreography, and any contract/param warnings.
  for (const s of gen.sections.filter((x) => x.motionPrimitiveId)) {
    console.log(`  \x1b[36mMOTION\x1b[0m [${s.index}:${s.name}] wrapped by motion-primitive ${s.motionPrimitiveId}`)
    for (const w of s.primitiveWarnings ?? []) console.log(`  \x1b[31mMOTION-WARN\x1b[0m [${s.index}:${s.name}] ${w}`)
  }

  // Static layout lint: flag flex/grid containers that will collide (missing gap/wrap).
  for (const s of gen.sections.filter((x) => x.layoutWarnings && x.layoutWarnings.length)) {
    for (const w of s.layoutWarnings!) {
      console.log(`  \x1b[33mLAYOUT\x1b[0m [${s.index}:${s.name}] ${w}`)
    }
  }

  // Theme-conformance lint: flag raw colors that bypass the committed palette tokens.
  for (const s of gen.sections.filter((x) => x.themeWarnings && x.themeWarnings.length)) {
    console.log(`  \x1b[35mOFF-THEME\x1b[0m [${s.index}:${s.name}] bypasses palette tokens: ${s.themeWarnings!.join(', ')}`)
  }

  // Image-staging lint: a dynamic src the resolver could not rewrite bypasses the whole shot plan.
  for (const s of gen.sections.filter((x) => x.imageWarnings && x.imageWarnings.length)) {
    console.log(`  \x1b[31mIMAGE-WARN\x1b[0m [${s.index}:${s.name}] ${s.imageWarnings!.join('; ')}`)
  }

  // Design-system lint: sections that STILL re-decide padding/container after the escalation pass.
  for (const s of gen.sections.filter((x) => x.designWarnings && x.designWarnings.length)) {
    console.log(`  \x1b[33mDESIGN\x1b[0m [${s.index}:${s.name}] ${s.designWarnings!.join('; ')}`)
  }

  // Report image sourcing: every placeholder upgraded to on-theme imagery (Unsplash photo / Flux generation).
  if (gen.imagesResolved > 0) {
    console.log(`  \x1b[36mIMAGES\x1b[0m upgraded ${gen.imagesResolved} placeholder(s) to on-theme imagery (Unsplash or Flux-generated).`)
  }

  if (noServe) {
    console.log('\n--no-serve: page written. Start it with:  cd preview/app && npm run dev')
    return
  }

  rule('SERVE  → http://localhost:5199')
  const child = spawn(npm, ['run', 'dev'], {
    cwd: APP,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_PREVIEW_ID: p.brand }
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error(`\ngenerate failed: ${(err as Error).message}`)
  process.exit(1)
})
