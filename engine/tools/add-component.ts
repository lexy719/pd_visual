/**
 * Quick-add a component: write the JSON in schema, ingest just that file, and prove it's
 * retrievable — in seconds, without re-embedding the corpus.
 *
 *   npm run add:component -- --name "Spotlight hero" --category hero --framework react \
 *       --tags "premium,dark,motion" --code ./snippet.tsx \
 *       --deps "motion,clsx,tailwind-merge" --registry-files "lib/utils.ts" --client \
 *       --notes "Design note only — dependencies belong in --deps, not prose."
 *
 *   # code piped / pasted on stdin (finish with Ctrl+Z then Enter on Windows, Ctrl+D on unix)
 *   npm run add:component -- --name "Glass card" --category card --tags "glass,dark" < snippet.tsx
 *
 * --framework defaults to react. --client is inferred from a "use client" directive unless set.
 * --id is derived (hero-005) unless you pass one. --force overwrites. --no-ingest just writes.
 *
 * Refuses React code that imports next/* or the legacy framer-motion package.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { KNOWLEDGE, rel } from '../ingest/build.js'
import { ingestSingleFile } from '../ingest/incremental.js'
import { queryKnowledge } from '../retrieval/query.js'
import type { ComponentDoc, Framework } from '../types.js'

interface Args {
  name?: string
  category?: string
  framework: Framework
  tags: string[]
  code?: string
  usage?: string
  id?: string
  notes?: string
  deps: string[]
  registryFiles: string[]
  clientComponent?: boolean
  sourceUrl?: string
  license: string
  force: boolean
  ingest: boolean
}

const list = (s: string): string[] => s.split(',').map((t) => t.trim()).filter(Boolean)

function parseArgs(argv: string[]): Args {
  const a: Args = {
    framework: 'react',
    tags: [],
    deps: [],
    registryFiles: [],
    license: 'MIT',
    force: false,
    ingest: true
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = (): string => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${flag} needs a value`)
      return v
    }
    switch (flag) {
      case '--name': a.name = next(); break
      case '--category': a.category = next().toLowerCase(); break
      case '--framework': {
        const v = next() as Framework
        if (v !== 'react' && v !== 'html') throw new Error('--framework must be react or html')
        a.framework = v
        break
      }
      case '--tags': a.tags = list(next()); break
      case '--code': a.code = next(); break
      case '--usage': a.usage = next(); break
      case '--id': a.id = next(); break
      case '--notes': a.notes = next(); break
      case '--deps': a.deps = list(next()); break
      case '--registry-files': a.registryFiles = list(next()); break
      case '--client': a.clientComponent = true; break
      case '--no-client': a.clientComponent = false; break
      case '--source-url': a.sourceUrl = next(); break
      case '--license': a.license = next(); break
      case '--force': a.force = true; break
      case '--no-ingest': a.ingest = false; break
      default: throw new Error(`unknown flag: ${flag}`)
    }
  }
  return a
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** hero-001, hero-002 → hero-003 */
function nextId(category: string): string {
  const dir = join(KNOWLEDGE, 'components')
  const re = new RegExp(`^${category}-(\\d+)\\.json$`)
  const nums = readdirSync(dir)
    .map((f) => f.match(re)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${category}-${String(next).padStart(3, '0')}`
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2))

  if (!a.name || !a.category) {
    console.error('Required: --name "..." --category <hero|nav|features|pricing|footer|...>')
    console.error('Code: --code ./snippet.html   (or pipe it on stdin)')
    process.exit(1)
  }

  const code = a.code ? readFileSync(resolve(a.code), 'utf8') : await readStdin()
  if (!code.trim()) {
    console.error('No code provided. Pass --code <file> or pipe the snippet on stdin.')
    process.exit(1)
  }
  if (!a.tags.length) {
    console.error('Warning: no --tags. Tags carry most of the retrieval signal for components.')
  }

  const id = a.id ?? nextId(a.category)
  const outPath = join(KNOWLEDGE, 'components', `${id}.json`)
  if (existsSync(outPath) && !a.force) {
    console.error(`${rel(outPath)} already exists. Pass --force to overwrite, or --id <other>.`)
    process.exit(1)
  }

  // Guard the two mistakes that silently poison a React target.
  if (a.framework === 'react') {
    if (/from ['"]next\//.test(code)) {
      console.error(`\nRefusing: code imports from "next/*". Target is plain React + Vite — replace it (e.g. next/image -> <img>).`)
      process.exit(1)
    }
    if (/from ['"]framer-motion['"]/.test(code)) {
      console.error(`\nRefusing: code imports the legacy "framer-motion" package. Normalize to "motion/react".`)
      process.exit(1)
    }
  }

  const doc: ComponentDoc = {
    id,
    name: a.name,
    category: a.category,
    framework: a.framework,
    tags: a.tags,
    code: code.trimEnd(),
    dependencies: a.deps,
    registry_files: a.registryFiles,
    client_component: a.clientComponent ?? /['"]use client['"]/.test(code),
    usage_example: a.usage ? readFileSync(resolve(a.usage), 'utf8').trimEnd() : '',
    source_url: a.sourceUrl ?? '',
    license: a.license,
    notes: a.notes ?? ''
  }
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`wrote ${rel(outPath)}  (id: ${id}, framework: ${doc.framework}, client: ${doc.client_component})`)
  if (a.framework === 'react' && a.deps.length === 0) {
    console.error('Warning: no --deps. The generation agent needs exact npm packages, not prose.')
  }

  if (!a.ingest) {
    console.log(`\nnot ingested (--no-ingest). When ready:  npm run ingest:file -- ${rel(outPath)}`)
    return
  }

  const r = await ingestSingleFile(outPath)
  console.log(`ingested: embedded ${r.embedded} chunk in ${r.ms}ms — corpus not re-embedded`)

  // Prove it's actually retrievable, using the text you'd realistically search with.
  const probe = [a.name, ...a.tags].join(', ')
  const hits = await queryKnowledge(probe, { kind: 'component', k: 5 })
  const rank = hits.findIndex((h) => h.doc_id === id)
  console.log(`\nretrieval check — query: "${probe}"`)
  hits.forEach((h, i) => {
    const mark = h.doc_id === id ? '→' : ' '
    console.log(`  ${mark} ${i + 1}. ${h.score.toFixed(3)}  ${h.doc_id}  ${h.name}`)
  })
  if (rank === 0) console.log('\nrank 1. good.')
  else if (rank > 0) console.log(`\nrank ${rank + 1}. retrievable, but something outranks it — sharpen name/tags if that's wrong.`)
  else console.log('\nNOT in top 5. Fix the name/tags — this component will never be retrieved as-is.')
}

main().catch((err) => {
  console.error(`\nadd:component failed: ${(err as Error).message}`)
  process.exit(1)
})
