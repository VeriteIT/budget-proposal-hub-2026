/**
 * BM25 sparse encoder for Pinecone hybrid search.
 *
 * Produces sparse vectors {indices, values} where:
 *   - indices = stable integer IDs derived by hashing each token
 *   - values  = BM25 scores (TF-IDF variant)
 *
 * Usage:
 *   1. Run `npm run fit-bm25` once to fit on the current corpus → bm25_params.json
 *   2. Call loadBM25Params() + encodeSparse() at ingest and query time
 */

import { readJsonBlob, writeJsonBlob } from '@/lib/blob-store'

const VOCAB_SIZE   = 30000           // hash space — keeps index size bounded
const PARAMS_PATH  = 'data/bm25_params.json'
const CORPUS_PATH  = 'data/chunk_corpus.json'

export interface SparseVector {
  indices: number[]
  values:  number[]
}

export interface BM25Params {
  idf:       Record<string, number>  // token → IDF score
  avgDocLen: number
  numDocs:   number
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

// ── Stable token → integer index via djb2 hash ───────────────────────────────

function tokenHash(token: string): number {
  let h = 5381
  for (let i = 0; i < token.length; i++) {
    h = ((h * 33) ^ token.charCodeAt(i)) >>> 0
  }
  return h % VOCAB_SIZE
}

// ── Fit BM25 IDF on a corpus ─────────────────────────────────────────────────

export function fitBM25(documents: string[]): BM25Params {
  const N   = documents.length
  const df  = new Map<string, number>()
  let total = 0

  for (const doc of documents) {
    const tokens = tokenize(doc)
    total += tokens.length
    for (const t of new Set(tokens)) {
      df.set(t, (df.get(t) ?? 0) + 1)
    }
  }

  const idf: Record<string, number> = {}
  for (const [token, count] of df.entries()) {
    idf[token] = Math.log((N - count + 0.5) / (count + 0.5) + 1)
  }

  return { idf, avgDocLen: total / Math.max(N, 1), numDocs: N }
}

// ── Persist / load BM25 params ───────────────────────────────────────────────

export async function saveBM25Params(params: BM25Params): Promise<void> {
  await writeJsonBlob(PARAMS_PATH, params)
}

export async function loadBM25Params(): Promise<BM25Params | null> {
  return readJsonBlob<BM25Params | null>(PARAMS_PATH, null)
}

// ── Chunk corpus (PDF text) used to improve BM25 IDF ─────────────────────────
// Stored as Record<fileId, string[]> so chunks can be removed per document.

type ChunkCorpus = Record<string, string[]>

async function readCorpus(): Promise<ChunkCorpus> {
  const raw = await readJsonBlob<ChunkCorpus | string[]>(CORPUS_PATH, {})
  // Migrate from old flat-array format
  if (Array.isArray(raw)) return { __legacy__: raw }
  return raw
}

export async function appendChunkCorpus(fileId: string, chunks: string[]): Promise<void> {
  const corpus = await readCorpus()
  corpus[fileId] = chunks
  await writeJsonBlob(CORPUS_PATH, corpus)
}

export async function removeFromChunkCorpus(fileId: string): Promise<void> {
  const corpus = await readCorpus()
  if (fileId in corpus) {
    delete corpus[fileId]
    await writeJsonBlob(CORPUS_PATH, corpus)
  }
}

export async function loadChunkCorpus(): Promise<string[]> {
  const corpus = await readCorpus()
  return Object.values(corpus).flat()
}

// Returns the stored chunks for a single document (in original order), or [] if none.
export async function getChunksForFile(fileId: string): Promise<string[]> {
  const corpus = await readCorpus()
  return corpus[fileId] ?? []
}

// ── Encode text → sparse vector ───────────────────────────────────────────────

export function encodeSparse(
  text:   string,
  params: BM25Params,
  k1 = 1.5,
  b  = 0.75,
): SparseVector {
  const tokens = tokenize(text)
  const docLen = tokens.length
  if (docLen === 0) return { indices: [], values: [] }

  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)

  // IDF for unseen tokens: assume df=1 (conservative)
  const unseenIdf = Math.log((params.numDocs + 0.5) / 1.5 + 1)

  // Accumulate scores per hash bucket (handles collisions by summing)
  const acc = new Map<number, number>()
  for (const [token, freq] of tf.entries()) {
    const idf      = params.idf[token] ?? unseenIdf
    const tfNorm   = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * docLen / params.avgDocLen))
    const score    = Math.max(0, tfNorm * idf)
    if (score > 0) {
      const idx = tokenHash(token)
      acc.set(idx, (acc.get(idx) ?? 0) + score)
    }
  }

  const indices = [...acc.keys()]
  const values  = indices.map((i) => acc.get(i)!)
  return { indices, values }
}
