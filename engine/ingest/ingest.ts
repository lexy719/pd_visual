/**
 * FULL rebuild of the knowledge store.
 *
 *   npm run ingest
 *
 * Wipes and re-embeds everything. Use this after changing chunking/embedding logic,
 * or on a fresh clone. To add or edit ONE file, use the incremental path instead —
 * it does not re-embed the rest of the corpus:
 *
 *   npm run ingest:file -- knowledge/components/hero-003.json
 */

import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { embedDocument } from '../retrieval/embed.js'
import { counts, insertDoc, openDb, resetSchema, DB_PATH } from '../retrieval/store.js'
import { buildDocsForFile, KNOWLEDGE, rel, SkipFile } from './build.js'

function listFiles(dir: string, ext: string): string[] {
  try {
    return readdirSync(dir)
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile() && extname(p).toLowerCase() === ext)
      .sort()
  } catch {
    return []
  }
}

/**
 * Every markdown dir that build.ts routes to the `guideline` kind. MUST stay in sync with the
 * guideline branch in build.ts — a dir routed there but missing here is silently invisible to
 * retrieval AND gets wiped by the next full ingest (this file calls resetSchema).
 */
const GUIDELINE_DIRS = [
  'guidelines',
  'layout-patterns',
  'storytelling-patterns',
  'hierarchy-patterns',
  'visual-rhythm',
  'ux-psychology'
]

/** critiques first (highest-value, hand-authored), then components, guidelines, media-refs */
function allKnowledgeFiles(): string[] {
  return [
    ...listFiles(join(KNOWLEDGE, 'critiques'), '.json'),
    ...listFiles(join(KNOWLEDGE, 'components'), '.json'),
    ...listFiles(join(KNOWLEDGE, 'motion-primitives'), '.json'),
    ...listFiles(join(KNOWLEDGE, 'plan-preferences'), '.json'),
    ...GUIDELINE_DIRS.flatMap((d) => listFiles(join(KNOWLEDGE, d), '.md')),
    ...listFiles(join(KNOWLEDGE, 'media-refs'), '.md')
  ]
}

async function main(): Promise<void> {
  // Build the queue and PROBE the embedder BEFORE touching the DB. A full ingest drops the
  // tables, so if embeddings are unreachable (Ollama down) we must abort without wiping the
  // existing knowledge base.
  const queue = []
  for (const path of allKnowledgeFiles()) {
    try {
      queue.push(...buildDocsForFile(path))
    } catch (err) {
      if (err instanceof SkipFile) {
        console.warn(`  ! skipping ${rel(path)} — ${err.message}`)
        continue
      }
      throw err
    }
  }

  if (queue.length === 0) {
    console.error('Nothing to ingest. Add files under /knowledge first.')
    process.exit(1)
  }

  try {
    await embedDocument('probe: is the embedder reachable?')
  } catch (err) {
    console.error(`\nEmbedder unreachable — ABORTING without touching the DB (your data is safe).\n  ${(err as Error).message}`)
    process.exit(1)
  }

  // Only now, with embeddings confirmed working, wipe and rebuild.
  const db = openDb()
  resetSchema(db)

  console.log(`Embedding ${queue.length} chunks with nomic-embed-text …`)
  let done = 0
  for (const doc of queue) {
    insertDoc(db, doc, await embedDocument(doc.embed_text))
    done++
    process.stdout.write(`\r  ${done}/${queue.length}  ${doc.kind.padEnd(10)} ${doc.doc_id.slice(0, 42)}`.padEnd(78))
  }
  process.stdout.write('\n')

  console.log(`\nIngested into ${rel(DB_PATH)}`)
  for (const [kind, n] of Object.entries(counts(db))) console.log(`  ${kind.padEnd(10)} ${n}`)
  console.log(`\nNow try:  npm run query -- "hero section, motorsport, dark, video background"`)
  db.close()
}

main().catch((err) => {
  console.error(`\nIngest failed: ${(err as Error).message}`)
  process.exit(1)
})
