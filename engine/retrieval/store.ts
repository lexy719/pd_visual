/** Vector store — sqlite-vec in a single portable file. No server process.
 *  `docs` holds metadata/payload; `vec_docs` holds the embeddings, joined on rowid. */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { EMBED_DIMS, toBlob } from './embed.js'
import type { DocKind, Framework, SearchHit } from '../types.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DB_PATH = process.env.KB_PATH || join(ROOT, 'knowledge', 'knowledge.db')

export function openDb(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')
  return db
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS docs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,
    doc_id      TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    framework   TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    source_path TEXT NOT NULL,
    embed_text  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    ingested_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_docs_kind ON docs(kind);
  CREATE INDEX IF NOT EXISTS idx_docs_framework ON docs(framework);
  CREATE INDEX IF NOT EXISTS idx_docs_source ON docs(source_path);
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_docs USING vec0(embedding float[${EMBED_DIMS}] distance_metric=cosine);
`

/** Create tables if absent. Never destroys data — used by incremental ingest. */
export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA)
}

/** Drop + recreate. Only the FULL rebuild (`npm run ingest`) uses this. */
export function resetSchema(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS vec_docs;')
  db.exec(SCHEMA)
}

/**
 * Remove every row that came from one source file, from both tables.
 * This is what makes a single-file re-ingest an upsert instead of a duplicate.
 * Returns how many rows were removed.
 */
export function deleteBySourcePath(db: Database.Database, sourcePath: string): number {
  const ids = db.prepare('SELECT id FROM docs WHERE source_path = ?').all(sourcePath) as Array<{ id: number }>
  const delVec = db.prepare('DELETE FROM vec_docs WHERE rowid = ?')
  const tx = db.transaction(() => {
    for (const { id } of ids) delVec.run(BigInt(id))
    db.prepare('DELETE FROM docs WHERE source_path = ?').run(sourcePath)
  })
  tx()
  return ids.length
}

export interface InsertDoc {
  kind: DocKind
  doc_id: string
  name: string
  category?: string
  /** '' for anything that isn't a component */
  framework?: string
  tags?: string[]
  source_path: string
  embed_text: string
  payload: unknown
}

export function insertDoc(db: Database.Database, doc: InsertDoc, vector: Float32Array): number {
  const info = db
    .prepare(
      `INSERT INTO docs (kind, doc_id, name, category, framework, tags, source_path, embed_text, payload, ingested_at)
       VALUES (@kind, @doc_id, @name, @category, @framework, @tags, @source_path, @embed_text, @payload, @ingested_at)`
    )
    .run({
      kind: doc.kind,
      doc_id: doc.doc_id,
      name: doc.name,
      category: doc.category ?? '',
      framework: doc.framework ?? '',
      tags: JSON.stringify(doc.tags ?? []),
      source_path: doc.source_path,
      embed_text: doc.embed_text,
      payload: JSON.stringify(doc.payload),
      ingested_at: Date.now()
    })
  const id = Number(info.lastInsertRowid)
  // sqlite-vec requires an integer (BigInt) rowid and a raw float32 blob.
  db.prepare('INSERT INTO vec_docs(rowid, embedding) VALUES (?, ?)').run(BigInt(id), toBlob(vector))
  return id
}

interface RawRow {
  id: number
  kind: DocKind
  doc_id: string
  name: string
  category: string
  framework: string
  tags: string
  source_path: string
  embed_text: string
  payload: string
  distance: number
}

export interface SearchOpts {
  /** how many results to return */
  k?: number
  /** restrict to one kind (component | guideline | critique | media-ref) */
  kind?: DocKind
  /**
   * restrict to one generation target (react | html). Only components carry a framework,
   * so this implicitly narrows to components. The agent MUST set this — retrieving a
   * plain-HTML component while generating React produces a broken hybrid page.
   */
  framework?: Framework
  /**
   * Diversity cap: at most this many hits from the same source file (i.e. the same site,
   * for critiques). Remaining slots are filled from the next-best site. Without it, one
   * richly-critiqued site monopolises every slot and the agent loses cross-site perspective.
   */
  maxPerSource?: number
  /** drop hits below this cosine similarity */
  minScore?: number
}

/**
 * KNN over the whole corpus, then filter. We over-fetch when a `kind`/`framework` filter is
 * set because vec0's MATCH can't post-filter — with a corpus this small that's free.
 */
export function search(db: Database.Database, queryVec: Float32Array, opts: SearchOpts = {}): SearchHit[] {
  const k = opts.k ?? 5
  // A cap needs headroom too: the capped-out hits must be replaced from further down the list.
  const filtered = Boolean(opts.kind || opts.framework || opts.maxPerSource)
  const fetch = filtered ? Math.max(k * 8, 40) : k
  const total = (db.prepare('SELECT count(*) AS n FROM docs').get() as { n: number }).n
  if (total === 0) return []

  const rows = db
    .prepare(
      `SELECT d.*, v.distance
         FROM vec_docs v
         JOIN docs d ON d.id = v.rowid
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance`
    )
    .all(toBlob(queryVec), Math.min(fetch, total)) as RawRow[]

  const ranked = rows
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      doc_id: r.doc_id,
      name: r.name,
      category: r.category,
      framework: r.framework,
      tags: JSON.parse(r.tags) as string[],
      source_path: r.source_path,
      embed_text: r.embed_text,
      payload: JSON.parse(r.payload) as unknown,
      // vec0 cosine distance is 0..2; similarity is 1 - distance
      score: 1 - r.distance
    }))
    .filter((h) => (opts.kind ? h.kind === opts.kind : true))
    .filter((h) => (opts.framework ? h.framework === opts.framework : true))
    .filter((h) => (opts.minScore != null ? h.score >= opts.minScore : true))

  if (!opts.maxPerSource) return ranked.slice(0, k)

  // Diversity cap: walk the already-ranked list and skip a hit once its source is full.
  // Order is preserved, so within a source the top-scoring observations are the ones kept.
  const perSource = new Map<string, number>()
  const out: SearchHit[] = []
  for (const h of ranked) {
    const n = perSource.get(h.source_path) ?? 0
    if (n >= opts.maxPerSource) continue
    perSource.set(h.source_path, n + 1)
    out.push(h)
    if (out.length >= k) break
  }
  return out
}

export function counts(db: Database.Database): Record<string, number> {
  const rows = db.prepare('SELECT kind, count(*) AS n FROM docs GROUP BY kind').all() as Array<{
    kind: string
    n: number
  }>
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]))
}
