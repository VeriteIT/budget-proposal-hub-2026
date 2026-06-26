import { Pinecone } from '@pinecone-database/pinecone'

let _pc: Pinecone | null = null

function getClient(): Pinecone {
  if (!_pc) {
    if (!process.env.PINECONE_API_KEY) throw new Error('PINECONE_API_KEY environment variable is required')
    _pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
  }
  return _pc
}

export function getPineconeIndex() {
  if (!process.env.PINECONE_INDEX_NAME) throw new Error('PINECONE_INDEX_NAME environment variable is required')
  return getClient().index(process.env.PINECONE_INDEX_NAME)
}
