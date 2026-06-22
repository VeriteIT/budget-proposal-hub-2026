import { task, logger } from '@trigger.dev/sdk/v3'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import { loadBM25Params } from '@/lib/sparse-encoder'
import {
  chunkText,
  resolvePdfFetchUrl,
  fetchAndParsePdf,
  buildSharedMeta,
  vectorizeChunks,
} from '@/lib/vectorize-pdf'

export const indexAllTask = task({
  id: 'index-all',
  maxDuration: 3600,
  run: async (_payload: Record<string, never>) => {
    const metadata   = await loadMetadata()
    const bm25Params = await loadBM25Params()
    const results    = { indexed: 0, skipped: 0, errors: [] as string[] }

    for (const [fileId, entry] of Object.entries(metadata)) {
      if (entry.vectorized) { results.skipped++; continue }

      try {
        const url = resolvePdfFetchUrl(entry, fileId)
        const fullText = await fetchAndParsePdf(url)
        if (fullText.trim().length < 100) { results.skipped++; continue }

        const chunks = chunkText(fullText)
        const sharedMeta = buildSharedMeta(fileId, entry)
        await vectorizeChunks(fileId, chunks, sharedMeta, bm25Params)

        const fresh = await loadMetadata()
        fresh[fileId] = { ...fresh[fileId], vectorized: true }
        await saveMetadata(fresh)

        results.indexed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'failed'
        logger.error(`index-all: ${fileId} failed`, { error: msg })
        results.errors.push(`${fileId}: ${msg}`)
      }
    }

    return results
  },
})
