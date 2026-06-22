import { NextRequest, NextResponse } from 'next/server'
import { runs } from '@trigger.dev/sdk/v3'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const run = await runs.retrieve(id)
    return NextResponse.json({
      status: run.status,
      output: run.output,
      error: run.error,
    })
  } catch (err) {
    console.error('[GET /api/admin/runs/[id]]', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch run status'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
