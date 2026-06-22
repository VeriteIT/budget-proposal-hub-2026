import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import { updateProposalInPinecone, deleteProposalFromPinecone } from '@/lib/pinecone-admin'
import { removeFromChunkCorpus } from '@/lib/sparse-encoder'

interface Params { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const fileId = decodeURIComponent(id)
    const body = (await req.json()) as Record<string, unknown>

    const metadata = await loadMetadata()
    const entry = metadata[fileId]
    if (!entry) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

    const langs = ['en', 'si', 'ta'] as const
    const multilangFields = ['title', 'summary', 'category', 'costLKR'] as const

    for (const field of multilangFields) {
      if (body[field] && typeof body[field] === 'object') {
        const incoming = body[field] as Record<string, string>
        const current = (entry[field] as Record<string, string>) ?? {}
        for (const lang of langs) {
          if (typeof incoming[lang] === 'string') current[lang] = incoming[lang]
        }
        entry[field] = current
      }
    }
    if (typeof body.badge === 'string') entry.badge = body.badge
    if (typeof body.thumbUrl === 'string') entry.thumbUrl = body.thumbUrl

    await saveMetadata(metadata)

    // Sync Pinecone — best-effort, JSON is already saved
    try {
      await updateProposalInPinecone(fileId, {
        title:    entry.title    as { en: string; si: string; ta: string },
        summary:  entry.summary  as { en: string; si: string; ta: string },
        category: entry.category as { en: string; si: string; ta: string },
        costLKR:  entry.costLKR  as { en: string; si: string; ta: string },
        badge:    entry.badge,
        thumbUrl: entry.thumbUrl,
      })
    } catch (pineconeErr) {
      console.warn('[PUT admin] Pinecone sync failed (JSON saved):', pineconeErr)
    }

    return NextResponse.json({ success: true, fileId })
  } catch (err) {
    console.error('[PUT /api/admin/proposals/[id]]', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const fileId = decodeURIComponent(id)

    const metadata = await loadMetadata()
    const entry = metadata[fileId]
    if (!entry) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

    delete metadata[fileId]
    await saveMetadata(metadata)

    // Remove from Pinecone, chunk corpus, and Blob storage — best-effort
    try { await deleteProposalFromPinecone(fileId) } catch (e) {
      console.warn('[DELETE admin] Pinecone delete failed:', e)
    }
    try { await removeFromChunkCorpus(fileId) } catch (e) {
      console.warn('[DELETE admin] Corpus cleanup failed:', e)
    }
    if (entry.pdfUrl) {
      try { await del(entry.pdfUrl) } catch (e) {
        console.warn('[DELETE admin] Blob delete failed:', e)
      }
    }

    return NextResponse.json({ success: true, fileId })
  } catch (err) {
    console.error('[DELETE /api/admin/proposals/[id]]', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
