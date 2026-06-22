import { NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { refitBM25Task } from '@/trigger/refit-bm25'

export async function POST() {
  try {
    const handle = await tasks.trigger<typeof refitBM25Task>('refit-bm25', {})
    return NextResponse.json({ runId: handle.id })
  } catch (err) {
    console.error('[POST /api/admin/refit-bm25]', err)
    const msg = err instanceof Error ? err.message : 'Refit failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
