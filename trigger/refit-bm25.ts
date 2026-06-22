import { task } from '@trigger.dev/sdk/v3'
import { loadMetadata } from '@/lib/metadata'
import { fitBM25, saveBM25Params, loadChunkCorpus } from '@/lib/sparse-encoder'

export const refitBM25Task = task({
  id: 'refit-bm25',
  maxDuration: 300,
  run: async (_payload: Record<string, never>) => {
    const metadata = await loadMetadata()
    const documents: string[] = []

    for (const entry of Object.values(metadata)) {
      for (const lang of ['en', 'si', 'ta'] as const) {
        const t = entry.title    as Record<string, string>
        const s = entry.summary  as Record<string, string>
        const c = entry.category as Record<string, string>
        const k = entry.costLKR  as Record<string, string>
        const text = [t[lang], s[lang], c[lang], k[lang]].filter(Boolean).join(' ').trim()
        if (text.length > 10) documents.push(text)
      }
    }

    const chunks = await loadChunkCorpus()
    documents.push(...chunks.filter((c) => c.length > 10))

    const params = fitBM25(documents)
    await saveBM25Params(params)

    return {
      success:   true,
      vocabSize: Object.keys(params.idf).length,
      metaDocs:  documents.length - chunks.length,
      chunkDocs: chunks.length,
      totalDocs: documents.length,
      avgDocLen: Math.round(params.avgDocLen),
    }
  },
})
