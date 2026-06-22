import { LlamaParseReader } from 'llamaindex'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { embedText } from '@/lib/gemini-embed'
import { encodeSparse, appendChunkCorpus, type BM25Params } from '@/lib/sparse-encoder'
import { getPineconeIndex } from '@/lib/pinecone-client'
import type { MetadataEntry } from '@/types'

const CHUNK_SIZE    = 1500
const CHUNK_OVERLAP = 150
const BATCH_SIZE    = 100

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

// Resolves a fetchable HTTP(S) URL for a proposal's PDF: the Blob URL for
// uploads made via the admin UI, or the deployed site's static asset path
// for PDFs shipped in public/assets/pdfs.
export function resolvePdfFetchUrl(entry: MetadataEntry, fileId: string): string {
  if (entry.pdfUrl) return entry.pdfUrl
  const base = (process.env.SITE_URL ?? '').replace(/\/$/, '')
  return `${base}/assets/pdfs/${fileId}`
}

// Downloads a PDF over HTTP and extracts its full text via LlamaParse.
export async function fetchAndParsePdf(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status}): ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())

  const tmpPath = path.join(os.tmpdir(), `vectorize-${Date.now()}-${path.basename(url).split('?')[0]}`)
  fs.writeFileSync(tmpPath, buffer)
  try {
    const reader = new LlamaParseReader({ resultType: 'markdown' })
    const docs = await reader.loadData(tmpPath)
    return docs.map((d: { getText(): string }) => d.getText()).join('\n\n')
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

export function buildSharedMeta(fileId: string, entry: MetadataEntry): Record<string, string> {
  const titleRec = entry.title    as Record<string, string>
  const sumRec   = entry.summary  as Record<string, string>
  const catRec   = entry.category as Record<string, string>
  const costRec  = entry.costLKR  as Record<string, string>

  return {
    source: 'budget_proposals',
    file_path: fileId,
    category: (typeof entry.category === 'string' ? entry.category : catRec.en) ?? '',
    badge: entry.badge ?? '',
    thumbUrl: entry.thumbUrl ?? '',
    added_date: entry.added_date ?? '',
    title_en: titleRec.en ?? '', title_si: titleRec.si ?? '', title_ta: titleRec.ta ?? '',
    summary_en: sumRec.en ?? '', summary_si: sumRec.si ?? '', summary_ta: sumRec.ta ?? '',
    category_en: catRec.en ?? '', category_si: catRec.si ?? '', category_ta: catRec.ta ?? '',
    costLKR_en: costRec.en ?? '', costLKR_si: costRec.si ?? '', costLKR_ta: costRec.ta ?? '',
  }
}

// Embeds each chunk (dense + optional sparse), upserts to Pinecone, and
// appends the chunks to the BM25 chunk corpus. Returns the vector count.
export async function vectorizeChunks(
  fileId: string,
  chunks: string[],
  sharedMeta: Record<string, string>,
  bm25Params: BM25Params | null,
): Promise<number> {
  const index = getPineconeIndex()

  const vectors: {
    id: string
    values: number[]
    sparseValues?: { indices: number[]; values: number[] }
    metadata: Record<string, string | number>
  }[] = []

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i])
    const vec: (typeof vectors)[number] = {
      id: `${fileId}_chunk_${i}`,
      values: embedding,
      metadata: { ...sharedMeta, chunk_index: i, text_preview: chunks[i].slice(0, 200) },
    }
    if (bm25Params) {
      const sv = encodeSparse(chunks[i], bm25Params)
      if (sv.indices.length > 0) vec.sparseValues = sv
    }
    vectors.push(vec)
  }

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await index.upsert(vectors.slice(i, i + BATCH_SIZE))
  }

  await appendChunkCorpus(fileId, chunks)

  return vectors.length
}
