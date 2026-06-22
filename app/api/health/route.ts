import { NextResponse } from 'next/server'
import { getPineconeIndex } from '@/lib/pinecone-client'

export async function GET() {
  try {
    const stats = await getPineconeIndex().describeIndexStats()
    return NextResponse.json({
      status: 'ok',
      pinecone: {
        totalVectors: stats.totalRecordCount ?? 0,
        dimension: stats.dimension ?? 768,
        indexName: process.env.PINECONE_INDEX_NAME,
      },
    })
  } catch (err) {
    console.error('[GET /api/health]', err)
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 503 },
    )
  }
}
