import { NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { indexAllTask } from '@/trigger/index-all'

export async function POST() {
  try {
    const handle = await tasks.trigger<typeof indexAllTask>('index-all', {})
    return NextResponse.json({ runId: handle.id })
  } catch (err) {
    console.error('[POST /api/admin/index-all]', err)
    const msg = err instanceof Error ? err.message : 'Index-all failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
