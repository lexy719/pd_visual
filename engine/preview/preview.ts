/**
 * Live-preview one library component in the Vite + React app.
 *
 *   npm run preview -- card-001
 *   npm run preview -- hero-004 --prep-only    (materialize files, don't start the server)
 *
 * Steps: read knowledge/components/<id>.json → drop its code + declared registry files into
 * preview/app/src → ensure its npm dependencies are installed → write the mount → run Vite.
 *
 * This does NOT type-check the component (esbuild transpiles as-is) — the point is to see it
 * render, exactly as the browser will run it.
 */

import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComponentDoc } from '../types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(ROOT, 'preview', 'app')
const REGISTRY = join(ROOT, 'preview', 'registry')
const MOUNTS = join(ROOT, 'preview', 'mounts')
const SRC = join(APP, 'src')

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function die(msg: string): never {
  console.error(`\npreview: ${msg}`)
  process.exit(1)
}

function loadComponent(id: string): ComponentDoc {
  const path = join(ROOT, 'knowledge', 'components', `${id}.json`)
  if (!existsSync(path)) die(`no component "${id}" (looked for ${path})`)
  const c = JSON.parse(readFileSync(path, 'utf8')) as ComponentDoc
  if (c.framework !== 'react') {
    die(`component "${id}" is framework="${c.framework}". The preview app is React + Vite only.`)
  }
  return c
}

/** Install the app's baseline deps once; then any declared dep that isn't present yet. */
function ensureDeps(c: ComponentDoc): void {
  if (!existsSync(join(APP, 'node_modules'))) {
    console.log('preview: installing base dependencies (first run)…')
    const r = spawnSync(npm, ['install'], { cwd: APP, stdio: 'inherit', shell: true })
    if (r.status !== 0) die('base npm install failed')
  }
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const known = new Set(Object.keys(pkg.dependencies ?? {}))
  const missing = (c.dependencies ?? []).filter((d) => !known.has(d) && !existsSync(join(APP, 'node_modules', d)))
  if (missing.length) {
    console.log(`preview: installing declared deps not yet present: ${missing.join(', ')}`)
    const r = spawnSync(npm, ['install', ...missing], { cwd: APP, stdio: 'inherit', shell: true })
    if (r.status !== 0) die(`npm install ${missing.join(' ')} failed`)
  }
}

/** Copy the registry files the component declares (e.g. lib/utils.ts) into src/. */
function writeRegistryFiles(c: ComponentDoc): void {
  for (const relPath of c.registry_files ?? []) {
    const from = join(REGISTRY, relPath)
    if (!existsSync(from)) {
      die(
        `component declares registry_file "${relPath}" but preview/registry/${relPath} doesn't exist.\n` +
          `Add its content there (it's a shared support file like lib/utils.ts).`
      )
    }
    const to = join(SRC, relPath)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
}

/** The mount (src/App.tsx): a hand-written wrapper, else the stored usage_example, else auto-detect. */
function writeMount(id: string, comp: ComponentDoc): 'hand-written' | 'usage_example' | 'auto' {
  const mountFile = join(MOUNTS, `${id}.tsx`)
  const dest = join(SRC, 'App.tsx')
  if (existsSync(mountFile)) {
    copyFileSync(mountFile, dest)
    return 'hand-written'
  }
  // The stored usage_example doubles as a preview mount — point it at the active component.
  if (comp.usage_example) {
    writeFileSync(dest, `${comp.usage_example.replace(/'\.\/component'/g, "'./active-component'")}\n`, 'utf8')
    return 'usage_example'
  }
  // Fallback for components with a self-contained export: prefer default, then *Demo, then
  // the first exported component. Primitives that need data will render empty/throw — which
  // is the honest signal that this component needs a mount wrapper.
  writeFileSync(
    dest,
    `import * as Mod from './active-component'
export default function App() {
  const m = Mod as Record<string, unknown>
  const demoKey = Object.keys(m).find((k) => /Demo$/.test(k))
  const compKey = Object.keys(m).find((k) => /^[A-Z]/.test(k) && typeof m[k] === 'function')
  const C = (m.default ?? (demoKey && m[demoKey]) ?? (compKey && m[compKey])) as
    | React.ComponentType
    | undefined
  if (!C) return <div style={{ padding: 40 }}>No renderable export found in active-component.</div>
  return <C />
}
import type React from 'react'
`,
    'utf8'
  )
  return 'auto'
}

function prep(id: string): ComponentDoc {
  const c = loadComponent(id)
  ensureDeps(c)
  mkdirSync(SRC, { recursive: true })
  // Fresh registry dirs so a previous component's files can't leak in.
  rmSync(join(SRC, 'lib'), { recursive: true, force: true })
  rmSync(join(SRC, 'hooks'), { recursive: true, force: true })
  writeFileSync(join(SRC, 'active-component.tsx'), `${c.code}\n`, 'utf8')
  writeRegistryFiles(c)
  const mount = writeMount(id, c)

  console.log(`\npreview: ${id}  (${c.name})`)
  console.log(`  framework      ${c.framework}${c.client_component ? '  (client)' : ''}`)
  console.log(`  dependencies   ${(c.dependencies ?? []).join(', ') || '(none)'}`)
  console.log(`  registry files ${(c.registry_files ?? []).join(', ') || '(none)'}`)
  console.log(`  mount          ${mount}${mount === 'auto' ? ' (no preview/mounts/' + id + '.tsx)' : ''}`)
  return c
}

function main(): void {
  const args = process.argv.slice(2)
  const prepOnly = args.includes('--prep-only')
  const id = args.find((a) => !a.startsWith('--'))
  if (!id) die('usage: npm run preview -- <component-id> [--prep-only]')

  prep(id)

  if (prepOnly) {
    console.log('\npreview: files materialized (--prep-only). Not starting the server.')
    return
  }

  console.log('\npreview: starting Vite dev server on http://localhost:5199 …\n')
  const child = spawn(npm, ['run', 'dev'], {
    cwd: APP,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_PREVIEW_ID: id }
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main()
