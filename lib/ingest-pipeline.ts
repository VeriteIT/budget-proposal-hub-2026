import { generateObject, jsonSchema } from 'ai'
import { put } from '@vercel/blob'
import { google } from '@/lib/google-ai'
import { embedText } from '@/lib/gemini-embed'
import { loadBM25Params, encodeSparse, appendChunkCorpus } from '@/lib/sparse-encoder'
import { getPineconeIndex } from '@/lib/pinecone-client'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import type { MetadataEntry } from '@/types'
import fs from 'fs'
import path from 'path'

async function parsePdfViaApi(filePath: string): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not set')

  const buffer = fs.readFileSync(filePath)
  const blob = new Blob([buffer], { type: 'application/pdf' })
  const form = new FormData()
  form.append('file', blob, path.basename(filePath))
  form.append('result_type', 'markdown')

  const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!uploadRes.ok) throw new Error(`LlamaCloud upload failed (${uploadRes.status})`)
  const { id: jobId } = await uploadRes.json() as { id: string }

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

  const resultRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!resultRes.ok) throw new Error(`Failed to fetch parse result (${resultRes.status})`)
  const { markdown } = await resultRes.json() as { markdown: string }
  return markdown
}

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 150
const BATCH_SIZE = 100

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function extractEnglishMetadata(text: string, filename: string) {
  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: jsonSchema<{ title: string; summary: string; category: string; costLKR: string }>({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise English title for this budget proposal' },
        summary: { type: 'string', description: 'Two-sentence English summary of the proposal' },
        category: {
          type: 'string',
          enum: [
            'Economic Growth', 'Justice and Rights', 'Governance',
            'Healthcare', 'Education', 'Infrastructure',
            'Agriculture', 'Environment', 'Technology', 'Other',
          ],
          description: 'Best matching category',
        },
        costLKR: {
          type: 'string',
          description: 'Estimated cost, e.g. "Cost = LKR 2.5 billion". Use "Not specified" if unknown.',
        },
      },
      required: ['title', 'summary', 'category', 'costLKR'],
    }),
    prompt: `Extract metadata from this Sri Lanka budget proposal (filename: ${filename}).\n\nDocument (first 3000 chars):\n${text.slice(0, 3000)}`,
  })
  return object
}

async function translateMetadata(en: { title: string; summary: string; category: string; costLKR: string }) {
  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: jsonSchema<{
      title_si: string; summary_si: string; category_si: string; costLKR_si: string
      title_ta: string; summary_ta: string; category_ta: string; costLKR_ta: string
    }>({
      type: 'object',
      properties: {
        title_si: { type: 'string' }, summary_si: { type: 'string' },
        category_si: { type: 'string' }, costLKR_si: { type: 'string' },
        title_ta: { type: 'string' }, summary_ta: { type: 'string' },
        category_ta: { type: 'string' }, costLKR_ta: { type: 'string' },
      },
      required: [
        'title_si', 'summary_si', 'category_si', 'costLKR_si',
        'title_ta', 'summary_ta', 'category_ta', 'costLKR_ta',
      ],
    }),
    prompt: `Translate these Sri Lanka budget proposal fields to Sinhala (si) and Tamil (ta).\nTitle: ${en.title}\nSummary: ${en.summary}\nCategory: ${en.category}\nCost: ${en.costLKR}`,
  })
  return object
}

export interface ManualMeta {
  title:    { en: string; si: string; ta: string }
  summary:  { en: string; si: string; ta: string }
  category: { en: string; si: string; ta: string }
  costLKR:  { en: string; si: string; ta: string }
}

export async function ingestPdf(
  pdfPath: string,
  options: { badge?: string; log?: (msg: string) => void; meta?: ManualMeta } = {},
): Promise<{ fileId: string; entry: MetadataEntry }> {
  const log = options.log ?? (() => {})

  if (!fs.existsSync(pdfPath)) throw new Error(`File not found: ${pdfPath}`)

  const filename = path.basename(pdfPath)
  const fileId = filename
  log(`Parsing PDF: ${filename}`)

  const fullText = await parsePdfViaApi(pdfPath)
  log(`  ${fullText.length.toLocaleString()} chars`)

  if (fullText.trim().length < 100) {
    throw new Error('Extracted text too short — PDF may be image-based or corrupted')
  }

  // Use manually provided metadata or auto-generate with Gemini
  let en: { title: string; summary: string; category: string; costLKR: string }
  let tr: { title_si: string; summary_si: string; category_si: string; costLKR_si: string
            title_ta: string; summary_ta: string; category_ta: string; costLKR_ta: string }
  let autoGenerated: boolean

  if (options.meta) {
    const m = options.meta
    // Each PDF is in ONE language — no translation. Store exactly what was provided.
    en = { title: m.title.en, summary: m.summary.en, category: m.category.en, costLKR: m.costLKR.en }
    tr = {
      title_si: m.title.si, summary_si: m.summary.si, category_si: m.category.si, costLKR_si: m.costLKR.si,
      title_ta: m.title.ta, summary_ta: m.summary.ta, category_ta: m.category.ta, costLKR_ta: m.costLKR.ta,
    }
    const filledTitle = m.title.en || m.title.si || m.title.ta
    log(`Using provided metadata: "${filledTitle}"`)
    autoGenerated = false
  } else {
    log('Extracting English metadata...')
    en = await extractEnglishMetadata(fullText, filename)
    log(`  Title: ${en.title}`)
    log(`  Category: ${en.category}`)
    log('Translating to Sinhala & Tamil...')
    tr = await translateMetadata(en)
    autoGenerated = true
  }

  const chunks = chunkText(fullText)
  log(`Embedding ${chunks.length} chunks...`)

  const index = getPineconeIndex()
  const addedDate = new Date().toISOString().split('T')[0]
  const badge = options.badge ?? 'New'
  const thumbUrl = filename.replace(/\.pdf$/i, '.jpg')

  // Use English category for Pinecone filter; fall back to SI or TA if this is a non-English-only PDF
  const categoryForFilter = en.category || tr.category_si || tr.category_ta

  const sharedMeta: Record<string, string> = {
    source: 'budget_proposals',
    file_path: fileId,
    category: categoryForFilter,
    badge,
    thumbUrl,
    added_date: addedDate,
    title_en: en.title,        title_si: tr.title_si,       title_ta: tr.title_ta,
    summary_en: en.summary,    summary_si: tr.summary_si,    summary_ta: tr.summary_ta,
    category_en: en.category,  category_si: tr.category_si,  category_ta: tr.category_ta,
    costLKR_en: en.costLKR,    costLKR_si: tr.costLKR_si,   costLKR_ta: tr.costLKR_ta,
  }

  const bm25Params = await loadBM25Params()
  if (!bm25Params) log('  [warn] bm25_params.json not found — upserting dense vectors only. Run npm run fit-bm25 first.')

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
    log(`  chunk ${i + 1}/${chunks.length}`)
  }

  await appendChunkCorpus(fileId, chunks)
  log(`Upserting ${vectors.length} vectors to Pinecone...`)
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await index.upsert(vectors.slice(i, i + BATCH_SIZE))
  }

  log('Uploading PDF to Blob storage...')
  const pdfBuffer = fs.readFileSync(pdfPath)
  const blob = await put(`pdfs/${fileId}`, pdfBuffer, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/pdf',
  })

  const entry: MetadataEntry = {
    title:    { en: en.title,    si: tr.title_si,    ta: tr.title_ta },
    summary:  { en: en.summary,  si: tr.summary_si,  ta: tr.summary_ta },
    category: { en: en.category, si: tr.category_si, ta: tr.category_ta },
    costLKR:  { en: en.costLKR,  si: tr.costLKR_si,  ta: tr.costLKR_ta },
    badge,
    thumbUrl: '',
    pdfUrl: blob.url,
    auto_generated: autoGenerated,
    vectorized: true,
    added_date: addedDate,
  }

  const metadata = await loadMetadata()
  metadata[fileId] = entry
  await saveMetadata(metadata)
  log(`Updated dynamic_metadata.json → "${fileId}"`)

  return { fileId, entry }
}
