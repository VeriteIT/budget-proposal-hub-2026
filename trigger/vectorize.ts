import { task } from '@trigger.dev/sdk/v3'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import { loadBM25Params } from '@/lib/sparse-encoder'
import {
  chunkText,
  resolvePdfFetchUrl,
  fetchAndParsePdf,
  buildSharedMeta,
  vectorizeChunks,
} from '@/lib/vectorize-pdf'

export interface VectorizePayload {
  fileId: string
}

export const vectorizeTask = task({
  id: 'vectorize-proposal',
  maxDuration: 900,
  run: async (payload: VectorizePayload) => {
    const { fileId } = payload

    const metadata = await loadMetadata()
    const entry = metadata[fileId]
    if (!entry) throw new Error(`Proposal not found in metadata: ${fileId}`)

    const url = resolvePdfFetchUrl(entry, fileId)
    const fullText = await fetchAndParsePdf(url)
    if (fullText.trim().length < 100) {
      throw new Error('Extracted text too short — image-based PDF?')
    }

    const chunks = chunkText(fullText)
    const sharedMeta = buildSharedMeta(fileId, entry)
    const bm25Params = await loadBM25Params()

    const vectorCount = await vectorizeChunks(fileId, chunks, sharedMeta, bm25Params)

    const fresh = await loadMetadata()
    fresh[fileId] = { ...fresh[fileId], vectorized: true }
    await saveMetadata(fresh)

    return { fileId, chunks: vectorCount }
  },
})
