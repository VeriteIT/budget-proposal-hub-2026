import { NextRequest, NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'
import { loadMetadata } from '@/lib/metadata'
import type { vectorizeTask } from '@/trigger/vectorize'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const fileId  = decodeURIComponent(id)

    const metadata = await loadMetadata()
    if (!metadata[fileId]) {
      return NextResponse.json({ error: 'Proposal not found in metadata' }, { status: 404 })
    }

    const handle = await tasks.trigger<typeof vectorizeTask>('vectorize-proposal', { fileId })
    return NextResponse.json({ runId: handle.id })
  } catch (err) {
    console.error('[POST /api/admin/proposals/[id]/vectorize]', err)
    const msg = err instanceof Error ? err.message : 'Vectorization failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
