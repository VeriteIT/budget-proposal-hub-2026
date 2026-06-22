import { generateText, generateObject, jsonSchema } from 'ai'
import { google } from '@/lib/google-ai'
import { embedText } from '@/lib/gemini-embed'
import { loadBM25Params, encodeSparse, getChunksForFile } from '@/lib/sparse-encoder'
import { loadMetadata, getField, resolvePdfUrl, resolveThumbUrl } from '@/lib/metadata'
import { loadCategories, resolveCategoryHex } from '@/lib/categories'
import { getPineconeIndex } from '@/lib/pinecone-client'
import type { Lang, ProposalResult } from '@/types'

// Weight between dense (HNSW) and sparse (BM25): 1 = pure dense, 0 = pure sparse
const ALPHA              = 0.75
const TOP_K_CHUNKS       = 50    // chunks fetched from Pinecone before dedup
const MAX_RESULTS        = 8     // documents shown to user after reranking
const SCORE_THRESHOLD    = 0.10  // drop documents below this hybrid score
const MAX_EXCERPT_CHARS  = 30000 // full-document excerpt length cap per document

async function transliterate(query: string, targetLang: 'si' | 'ta'): Promise<string> {
  if (!/^[a-zA-Z\s]+$/.test(query)) return query
  try {
    const langName = targetLang === 'si' ? 'Sinhala' : 'Tamil'
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: `Convert this romanised ${langName} text to proper ${langName} script for a Sri Lanka budget proposals search. Return only the converted text: "${query}"`,
    })
    return text.trim() || query
  } catch {
    return query
  }
}

async function rerank(query: string, candidates: ProposalResult[]): Promise<ProposalResult[]> {
  if (candidates.length <= 1) return candidates
  try {
    const candidateText = candidates
      .map((p, i) => `${i + 1}. ${p.title} — ${p.summary.slice(0, 80)}`)
      .join('\n')

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: jsonSchema<{ rankedIndices: number[] }>({
        type: 'object',
        properties: {
          rankedIndices: {
            type: 'array',
            items: { type: 'number' },
            description: '0-based indices of candidates ordered most-relevant first',
          },
        },
        required: ['rankedIndices'],
      }),
      prompt: `Rerank these Sri Lanka budget proposals by relevance to the query: "${query}"\n\nCandidates:\n${candidateText}\n\nReturn rankedIndices as a 0-based index array (up to ${candidates.length} items), most relevant first. Omit any candidates you consider irrelevant.`,
    })

    const indices = (object.rankedIndices as number[]).filter(
      (i) => i >= 0 && i < candidates.length,
    )
    const reranked = indices.map((i) => candidates[i])
    const included = new Set(indices)
    candidates.forEach((c, i) => { if (!included.has(i)) reranked.push(c) })
    return reranked
  } catch {
    return candidates
  }
}

/**
 * Pinecone hybrid query: dense (HNSW via gemini-embedding-2) + sparse (BM25).
 * Alpha-scales both vectors before sending so Pinecone fuses them server-side.
 * Falls back to dense-only if bm25_params.json has not been generated yet.
 */
async function pineconeHybridQuery(
  query: string,
  categoryFilter?: string | null,
): Promise<{ id: string; score: number }[]> {
  const [denseVec, bm25Params] = await Promise.all([
    embedText(query),
    loadBM25Params(),
  ])

  const filter: Record<string, string> = { source: 'budget_proposals' }
  if (categoryFilter && categoryFilter !== 'All categories') {
    filter.category = categoryFilter
  }

  // Scale dense by alpha, sparse by (1 - alpha) for weighted fusion in Pinecone
  const queryOptions: Parameters<ReturnType<typeof getPineconeIndex>['query']>[0] = {
    vector: denseVec.map((v) => v * ALPHA),
    topK: TOP_K_CHUNKS,
    includeMetadata: true,
    filter,
  }

  if (bm25Params) {
    const sparse = encodeSparse(query, bm25Params)
    if (sparse.indices.length > 0) {
      queryOptions.sparseVector = {
        indices: sparse.indices,
        values: sparse.values.map((v) => v * (1 - ALPHA)),
      }
    }
  }

  const res = await getPineconeIndex().query(queryOptions)

  // Group chunk matches by file_path, keeping the best score per document
  const byFile = new Map<string, number>()
  for (const match of res.matches) {
    const fp = (match.metadata?.file_path as string) ?? match.id
    const score = match.score ?? 0
    if (score > (byFile.get(fp) ?? -Infinity)) byFile.set(fp, score)
  }

  return [...byFile.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

// Returns the full document text (all chunks, in order), truncated to MAX_EXCERPT_CHARS.
async function buildExcerpt(fileId: string): Promise<string> {
  const chunks = await getChunksForFile(fileId)
  if (chunks.length === 0) return ''

  const text = chunks.join('\n\n')
  return text.length > MAX_EXCERPT_CHARS ? text.slice(0, MAX_EXCERPT_CHARS) + '…' : text
}

export async function hybridSearch(
  query: string,
  lang: Lang,
  categoryFilter?: string | null,
  options: { includeExcerpts?: boolean } = {},
): Promise<ProposalResult[]> {
  let processedQuery = query
  if (lang === 'si') processedQuery = await transliterate(query, 'si')
  else if (lang === 'ta') processedQuery = await transliterate(query, 'ta')

  const searchResults = await pineconeHybridQuery(processedQuery, categoryFilter)
  const top5 = searchResults
    .filter(({ score }) => score >= SCORE_THRESHOLD)
    .slice(0, MAX_RESULTS)

  const metadata = await loadMetadata()
  const categoryMap = await loadCategories()
  const results: ProposalResult[] = []

  for (const { id: fileId, score } of top5) {
    const entry = metadata[fileId]
    if (!entry) continue
    const title   = getField(entry, 'title', lang)
    const summary = getField(entry, 'summary', lang)
    if (!title || !summary) continue

    results.push({
      title,
      summary,
      costLKR:      getField(entry, 'costLKR', lang),
      category:     getField(entry, 'category', lang),
      categoryEn:   getField(entry, 'category', 'en'),
      categoryHex:  resolveCategoryHex(categoryMap, {
        en: getField(entry, 'category', 'en'),
        si: getField(entry, 'category', 'si'),
        ta: getField(entry, 'category', 'ta'),
      }),
      badge:        entry.badge ?? '',
      pdfUrl:       resolvePdfUrl(entry, fileId),
      thumbUrl:     resolveThumbUrl(entry),
      score,
      relevance_percentage: Math.min(100, Math.round(score * 1000)),
      file_path: fileId,
      ...(options.includeExcerpts ? { excerpt: await buildExcerpt(fileId) } : {}),
    })
  }

  return rerank(processedQuery, results)
}
