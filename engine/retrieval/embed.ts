/** Embedding layer — nomic-embed-text via local Ollama. 768 dimensions.
 *  Kept isolated so the vector store and ingest never care which model produced the vector. */

const OLLAMA = process.env.OLLAMA_URL?.replace(/\/$/, '') || 'http://127.0.0.1:11434'
export const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text'
export const EMBED_DIMS = 768

/**
 * nomic-embed-text is trained with task prefixes. Using the right one measurably improves
 * retrieval: documents are stored as `search_document`, queries as `search_query`.
 */
type EmbedTask = 'search_document' | 'search_query'

async function embedOne(text: string, task: EmbedTask): Promise<Float32Array> {
  const input = `${task}: ${text}`.slice(0, 8000)
  const res = await fetch(`${OLLAMA}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({ model: EMBED_MODEL, input })
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Embedding failed (${res.status}). Is Ollama running and "${EMBED_MODEL}" pulled?\n` +
        `  ollama pull ${EMBED_MODEL}\n${body.slice(0, 200)}`
    )
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> }
  const vec = json.data?.[0]?.embedding
  if (!vec?.length) throw new Error('Embedding response had no vector')
  if (vec.length !== EMBED_DIMS) {
    throw new Error(`Expected ${EMBED_DIMS} dims from ${EMBED_MODEL}, got ${vec.length}`)
  }
  return new Float32Array(vec)
}

export const embedDocument = (text: string): Promise<Float32Array> => embedOne(text, 'search_document')
export const embedQuery = (text: string): Promise<Float32Array> => embedOne(text, 'search_query')

/** sqlite-vec binds vectors as raw little-endian float32 blobs. */
export function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}
