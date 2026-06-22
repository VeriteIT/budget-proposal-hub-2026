import { Pinecone } from '@pinecone-database/pinecone'

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY environment variable is required')
}

export const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })

export function getPineconeIndex() {
  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error('PINECONE_INDEX_NAME environment variable is required')
  }
  return pc.index(process.env.PINECONE_INDEX_NAME)
}
