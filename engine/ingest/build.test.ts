import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { buildDocsForFile } from './build.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const patternPath = resolve(__dirname, '../../knowledge/storytelling-patterns/reveal-before-explain.md')

test('buildDocsForFile indexes storytelling pattern markdown docs as retrievable guidelines', () => {
  const docs = buildDocsForFile(patternPath)
  assert.equal(docs[0]?.kind, 'guideline')
  assert.ok(docs.some((doc) => doc.payload && typeof doc.payload === 'object' && 'heading' in doc.payload && doc.payload.heading === 'Examples'))
  assert.ok(docs.some((doc) => doc.tags?.includes('narrative')))
})
