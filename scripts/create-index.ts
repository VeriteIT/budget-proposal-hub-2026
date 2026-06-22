/**
 * Creates a Pinecone index dimensioned for gemini-embedding-2 (3072 dims).
 * Run once before ingesting any documents.
 *
 * Usage:  npm run create-index
 *
 * Requires in .env.local:
 *   PINECONE_API_KEY
 *   PINECONE_INDEX_NAME  (e.g. "budget-proposals")
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { Pinecone } from '@pinecone-database/pinecone'

const EMBEDDING_DIMENSION = 768  // gemini-embedding-2 with outputDimensionality: 768

async function main() {
  const apiKey    = process.env.PINECONE_API_KEY
  const indexName = process.env.PINECONE_INDEX_NAME

  if (!apiKey)    throw new Error('PINECONE_API_KEY is not set in .env.local')
  if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set in .env.local')

  const pc = new Pinecone({ apiKey })

  // Check if index already exists
  const existing = await pc.listIndexes()
  const alreadyExists = (existing.indexes ?? []).some((idx) => idx.name === indexName)

  if (alreadyExists) {
    console.log(`Index "${indexName}" already exists — nothing to do.`)
    console.log('If you need to recreate it (e.g. to change dimension), delete it first in the Pinecone console.')
    return
  }

  console.log(`Creating index "${indexName}" with ${EMBEDDING_DIMENSION} dimensions (gemini-embedding-2)...`)

  await pc.createIndex({
    name: indexName,
    dimension: EMBEDDING_DIMENSION,
    metric: 'dotproduct',   // required for hybrid search (HNSW dense + BM25 sparse)
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  })

  console.log(`Done! Index "${indexName}" created with dotproduct metric.`)
  console.log('Next steps:')
  console.log('  1. npm run fit-bm25   — fit BM25 encoder on your corpus')
  console.log('  2. npm run ingest-all — re-index all documents with sparse vectors')
  console.log('Wait ~1 minute for the index to become ready before ingesting.')
}

main().catch((err: unknown) => {
  console.error('create-index failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
