/**
 * Bulk-ingests all PDFs in public/assets/pdfs/ into Pinecone using the
 * metadata already stored in dynamic_metadata.json — no Gemini extraction
 * calls needed, only embedding. Skips PDFs already in Pinecone.
 *
 * Usage:  npm run ingest-all
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { LlamaParseReader } from 'llamaindex'
import { embedText } from '@/lib/gemini-embed'
import { loadBM25Params, encodeSparse, appendChunkCorpus } from '@/lib/sparse-encoder'
import { Pinecone } from '@pinecone-database/pinecone'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import fs from 'fs'

const CHUNK_SIZE    = 1500
const CHUNK_OVERLAP = 150
const BATCH_SIZE    = 100
const PDF_DIR       = path.join(process.cwd(), 'public', 'assets', 'pdfs')

const pc    = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
const index = pc.index(process.env.PINECONE_INDEX_NAME!)

function chunkText(text: string): string[] {
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

async function isAlreadyInPinecone(fileId: string): Promise<boolean> {
  try {
    const result = await index.fetch([`${fileId}_chunk_0`])
    return Object.keys(result.records).length > 0
  } catch {
    return false
  }
}

async function ingestOne(fileId: string): Promise<void> {
  const metadata = await loadMetadata()
  const entry    = metadata[fileId]
  const pdfPath  = path.join(PDF_DIR, fileId)

  if (!entry) {
    console.log(`  SKIP (no metadata entry): ${fileId}`)
    return
  }
  if (!fs.existsSync(pdfPath)) {
    console.log(`  SKIP (PDF not found in public/assets/pdfs/): ${fileId}`)
    return
  }
  if (await isAlreadyInPinecone(fileId)) {
    console.log(`  SKIP (already in Pinecone): ${fileId}`)
    return
  }

  console.log(`  Ingesting: ${fileId}`)

  // Parse PDF
  const reader   = new LlamaParseReader({ resultType: 'markdown' })
  const docs     = await reader.loadData(pdfPath)
  const fullText = docs.map((d: { getText(): string }) => d.getText()).join('\n\n')

  if (fullText.trim().length < 100) {
    console.log(`    SKIP (text too short — image-based PDF?): ${fileId}`)
    return
  }

  const chunks = chunkText(fullText)
  console.log(`    ${docs.length} pages, ${chunks.length} chunks`)

  // Build shared metadata from existing JSON entry (no Gemini calls needed)
  const titleRec   = entry.title    as Record<string, string>
  const sumRec     = entry.summary  as Record<string, string>
  const catRec     = entry.category as Record<string, string>
  const costRec    = entry.costLKR  as Record<string, string>

  const sharedMeta: Record<string, string> = {
    source:      'budget_proposals',
    file_path:   fileId,
    category:    (typeof entry.category === 'string' ? entry.category : catRec.en) ?? '',
    badge:       entry.badge ?? '',
    thumbUrl:    entry.thumbUrl ?? '',
    added_date:  entry.added_date ?? '',
    title_en:    titleRec.en  ?? '',  title_si:    titleRec.si  ?? '',  title_ta:    titleRec.ta  ?? '',
    summary_en:  sumRec.en    ?? '',  summary_si:  sumRec.si    ?? '',  summary_ta:  sumRec.ta    ?? '',
    category_en: catRec.en    ?? '',  category_si: catRec.si    ?? '',  category_ta: catRec.ta    ?? '',
    costLKR_en:  costRec.en   ?? '',  costLKR_si:  costRec.si   ?? '',  costLKR_ta:  costRec.ta   ?? '',
  }

  // Embed and upsert (dense + sparse for hybrid search)
  const bm25Params = await loadBM25Params()
  if (!bm25Params) console.log('    [warn] bm25_params.json missing — dense only. Run npm run fit-bm25.')

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
    if (bm25Params) { const sv = encodeSparse(chunks[i], bm25Params); if (sv.indices.length > 0) vec.sparseValues = sv }
    vectors.push(vec)
    process.stdout.write(`\r    embedding chunk ${i + 1}/${chunks.length}  `)
  }
  console.log()

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await index.upsert(vectors.slice(i, i + BATCH_SIZE))
  }
  await appendChunkCorpus(fileId, chunks)
  console.log(`    ${vectors.length} vectors upserted`)

  // Mark vectorized in JSON
  const fresh = await loadMetadata()
  fresh[fileId] = { ...fresh[fileId], vectorized: true }
  await saveMetadata(fresh)
}

async function main() {
  const metadata  = await loadMetadata()
  const fileIds   = Object.keys(metadata)
  console.log(`Found ${fileIds.length} proposals in dynamic_metadata.json\n`)

  let ingested = 0
  let skipped  = 0

  for (const fileId of fileIds) {
    const before = ingested
    await ingestOne(fileId)
    if (ingested === before) skipped++
    else ingested++
  }

  // Re-count — ingestOne logs skip itself
  const allMeta = await loadMetadata()
  const vectorized = Object.values(allMeta).filter((e) => e.vectorized).length
  console.log(`\nDone — ${vectorized}/${fileIds.length} proposals now vectorized in Pinecone`)
}

main().catch((err: unknown) => {
  console.error('ingest-all failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
