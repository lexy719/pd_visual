// Re-run the visual pass on the ALREADY-BUILT Verso page (the run's critique failed on the
// image-size cap; the page itself shipped). Same driver as gate 2.
import { visualPass } from './engine/agent/visual-critique.js'
import { readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs'
import type { Plan, SectionResult } from './engine/agent/types.js'

const dir = 'preview/app/src/generated'
const files = readdirSync(dir).filter((f) => f.startsWith('section-')).sort()
const sections: SectionResult[] = files.map((f, i) => ({
  index: i, name: f.replace(/^section-\d+-/, '').replace(/\.tsx$/, ''), composition: 'editorial',
  strategy: 'scratch', tier: 'bulk', moduleName: './generated/' + f.replace(/\.tsx$/, ''),
  code: readFileSync(dir + '/' + f, 'utf8'), retrieved: { guidelines: [], critiques: [] }
} as SectionResult))
const plan = { brand: 'Verso', moodProfile: 'premium, calm', mood: ['premium', 'calm'], avoidances: [], brief: 'Verso bookbindery', creativeBrief: {}, sections: [] } as unknown as Plan
const writeBack = () => { for (let i = 0; i < files.length; i++) writeFileSync(dir + '/' + files[i], sections[i].code) }

const r = await visualPass(plan, sections, 'preview/app', writeBack, (m) => console.log(m))
console.log('\nran:', r.ran, '| before:', r.defectsBefore.length, '| revised:', r.revisedSections, '| restored:', r.restoredSections, '| surviving:', r.surviving.length)
if (r.ran) {
  // publish the FINAL state to the user's session link
  cpSync('preview/app/dist', 'projects/02663dba-64fc-4fa6-adad-7792152a2c7f/site', { recursive: true, force: true })
  console.log('session snapshot updated with final state')
}
console.log('shots:', r.shotsDir)
