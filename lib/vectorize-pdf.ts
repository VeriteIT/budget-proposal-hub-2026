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

// Downloads a PDF and extracts its full text via the LlamaCloud REST API —
// no native bindings needed, works in any serverless/container environment.
export async function fetchAndParsePdf(url: string): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not set')

  // 1. Download the PDF bytes
  const pdfRes = await fetch(url)
  if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status}): ${url}`)
  const pdfBlob = await pdfRes.blob()
  const filename = url.split('/').pop()?.split('?')[0] ?? 'document.pdf'

  // 2. Upload to LlamaCloud
  const form = new FormData()
  form.append('file', pdfBlob, filename)
  form.append('result_type', 'markdown')

  const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!uploadRes.ok) throw new Error(`LlamaCloud upload failed (${uploadRes.status})`)
  const { id: jobId } = await uploadRes.json() as { id: string }

  // 3. Poll until complete (max 5 minutes)
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const { status } = await statusRes.json() as { status: string }
    if (status === 'SUCCESS') break
    if (status === 'ERROR') throw new Error(`LlamaCloud parsing failed for job ${jobId}`)
  }

  // 4. Fetch markdown result
  const resultRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!resultRes.ok) throw new Error(`Failed to fetch parse result (${resultRes.status})`)
  const { markdown } = await resultRes.json() as { markdown: string }
  return markdown
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
