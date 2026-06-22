import { NextResponse } from 'next/server'
import { getPineconeIndex } from '@/lib/pinecone-client'
import { loadMetadata, saveMetadata } from '@/lib/metadata'

export async function POST() {
  try {
    // Clear all vectors from Pinecone
    await getPineconeIndex().deleteAll()

    // Reset vectorized flags in metadata
    const metadata = await loadMetadata()
    let count = 0
    for (const entry of Object.values(metadata)) {
      if (entry.vectorized) { entry.vectorized = false; count++ }
    }
    await saveMetadata(metadata)

    return NextResponse.json({ success: true, reset: count })
  } catch (err) {
    console.error('[POST /api/admin/clear-vectors]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Clear failed' }, { status: 500 })
  }
}
