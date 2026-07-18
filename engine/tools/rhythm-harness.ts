/** Live proof that the rhythm CSS moves real geometry, using the REAL emitted CSS (imported). */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rhythmCss, planRhythm } from '../agent/rhythm.js'
import type { SectionPlan } from '../agent/types.js'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const S = (c: any, e: any): SectionPlan => ({ name: 'x', intent: 'x', composition: c, emphasis: e })
const plan = [S('cinematic','lg'), S('asymmetric','xl'), S('narrative','md'), S('modular','lg'), S('timeline','md'), S('editorial','sm'), S('editorial','md')]
const r = planRhythm(plan)
// Mirrors what themeCss emits: h2 locked with !important, reading from --h2.
const base = `:root{--section-pad:clamp(96px,14vh,136px);--h2-base:clamp(38px,4vw,51px);--h2:var(--h2-base)}
*{box-sizing:border-box}body{margin:0;font:16px system-ui}
h2{font-size:var(--h2) !important;margin:0}
.section-pad{padding-block:var(--section-pad)}
.container-page{max-width:1152px;margin-inline:auto;padding-inline:24px}`
const secs = r.beats.map((b,i)=>`<section id="s${i}" class="section-pad rhythm-${b.density} vol-${b.volume}"><div class="container-page"><h2 id="h${i}">Section ${i} — ${b.density}/${b.volume}</h2></div></section>`).join('\n')
mkdirSync(join(ROOT,'logs'),{recursive:true})
const out = join(ROOT,'logs','rhythm-harness.html')
writeFileSync(out, `<!doctype html><meta charset=utf-8><title>rhythm</title><style>${base}${rhythmCss()}</style>${secs}`,'utf8')
console.log(out)
