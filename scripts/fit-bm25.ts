/**
 * Fits the BM25 sparse encoder on:
 *   1. Metadata fields (title, summary, category, costLKR) from dynamic_metadata.json
 *   2. Full PDF chunk text from chunk_corpus.json (written during ingestion)
 *
 * Saves IDF params to bm25_params.json.
 *
 * Run after ingestion completes so both metadata and document text are included.
 *
 * Usage:  npm run fit-bm25
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { loadMetadata } from '@/lib/metadata'
import { fitBM25, saveBM25Params, loadChunkCorpus, tokenize } from '@/lib/sparse-encoder'

async function main() {
  const metadata = await loadMetadata()
  const documents: string[] = []

  // ── Source 1: metadata fields (all 3 languages) ───────────────────────────────
  for (const entry of Object.values(metadata)) {
    for (const lang of ['en', 'si', 'ta'] as const) {
      const titleRec = entry.title    as Record<string, string>
      const sumRec   = entry.summary  as Record<string, string>
      const catRec   = entry.category as Record<string, string>
      const costRec  = entry.costLKR  as Record<string, string>

      const text = [titleRec[lang], sumRec[lang], catRec[lang], costRec[lang]]
        .filter(Boolean)
        .join(' ')
        .trim()

      if (text.length > 10) documents.push(text)
    }
  }

  // ── Source 2: full PDF chunk text from chunk_corpus.json ──────────────────────
  const chunks = await loadChunkCorpus()
  documents.push(...chunks.filter((c) => c.length > 10))

  console.log(`Fitting BM25 on:`)
  console.log(`  Metadata segments : ${documents.length - chunks.length}`)
  console.log(`  PDF chunk segments: ${chunks.length}`)
  console.log(`  Total             : ${documents.length} documents`)
  console.log()

  const params = fitBM25(documents)
  await saveBM25Params(params)

  const vocabSize   = Object.keys(params.idf).length
  const totalTokens = documents.reduce((n, d) => n + tokenize(d).length, 0)

  console.log(`Done.`)
  console.log(`  Vocab size : ${vocabSize.toLocaleString()} terms`)
  console.log(`  Avg doc len: ${params.avgDocLen.toFixed(1)} tokens`)
  console.log(`  Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`  Saved to   : bm25_params.json`)
}

main()
