/**
 * Single-file (incremental) ingest — an UPSERT scoped to one file.
 *
 * Cost is O(chunks in that file), NOT O(corpus). Existing rows are never re-embedded:
 * we delete only the rows whose `source_path` matches, then embed and insert that file's
 * chunks. Everything else keeps its row, its vector, and its `ingested_at` stamp.
 */

import type Database from 'better-sqlite3'
import { embedDocument } from '../retrieval/embed.js'
import { deleteBySourcePath, ensureSchema, insertDoc, openDb } from '../retrieval/store.js'
import { buildDocsForFile, rel, SkipFile } from './build.js'

export interface IngestFileResult {
  sourcePath: string
  /** rows removed for this file (0 on first ingest, N on re-ingest) */
  removed: number
  /** rows inserted = chunks embedded. The ONLY embeddings computed. */
  embedded: number
  ms: number
}

/** Upsert one file into an already-open db. */
export async function ingestFile(db: Database.Database, absPath: string): Promise<IngestFileResult> {
  const t0 = Date.now()
  ensureSchema(db)
  const docs = buildDocsForFile(absPath) // throws SkipFile for scaffolds/malformed
  const sourcePath = docs[0].source_path

  const removed = deleteBySourcePath(db, sourcePath)
  for (const doc of docs) {
    const vec = await embedDocument(doc.embed_text) // <- only this file's chunks
    insertDoc(db, doc, vec)
  }
  return { sourcePath, removed, embedded: docs.length, ms: Date.now() - t0 }
}

/** Convenience: open db, upsert one file, close. */
export async function ingestSingleFile(absPath: string): Promise<IngestFileResult> {
  const db = openDb()
  try {
    return await ingestFile(db, absPath)
  } finally {
    db.close()
  }
}

export { SkipFile, rel }
