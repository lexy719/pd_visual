/**
 * Incremental ingest of one file. Does NOT touch the rest of the corpus.
 *
 *   npm run ingest:file -- knowledge/components/hero-003.json
 *   npm run ingest:file -- knowledge/critiques/some-site.json
 *   npm run ingest:file -- knowledge/guidelines/color-theory.md
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ingestSingleFile, SkipFile } from './incremental.js'
import { counts, openDb } from '../retrieval/store.js'

async function main(): Promise<void> {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: npm run ingest:file -- <path-to-knowledge-file>')
    process.exit(1)
  }
  const abs = resolve(target)
  if (!existsSync(abs)) {
    console.error(`No such file: ${target}`)
    process.exit(1)
  }

  try {
    const r = await ingestSingleFile(abs)
    const verb = r.removed > 0 ? `updated (replaced ${r.removed} row${r.removed === 1 ? '' : 's'})` : 'added'
    console.log(`${verb}: ${r.sourcePath}`)
    console.log(`  embedded ${r.embedded} chunk${r.embedded === 1 ? '' : 's'} in ${r.ms}ms — nothing else re-embedded`)

    const db = openDb()
    const total = Object.values(counts(db)).reduce((a, b) => a + b, 0)
    db.close()
    console.log(`  corpus now ${total} chunks`)
  } catch (err) {
    if (err instanceof SkipFile) {
      console.error(`Skipped: ${(err as Error).message}`)
      process.exit(1)
    }
    console.error(`Ingest failed: ${(err as Error).message}`)
    process.exit(1)
  }
}

main()
