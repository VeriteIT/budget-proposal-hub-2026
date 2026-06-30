import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { loadMetadata, saveMetadata } from '@/lib/metadata'
import { updateProposalInPinecone } from '@/lib/pinecone-admin'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const fileId = decodeURIComponent(id)

    const metadata = await loadMetadata()
    const entry = metadata[fileId]
    if (!entry) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get('thumbnail') as File | null
    if (!file || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'An image file is required' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const baseName = fileId.replace(/\.pdf$/i, '')
    const buffer = Buffer.from(await file.arrayBuffer())

    const blob = await put(`thumbs/${baseName}.${ext}`, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: file.type,
    })

    entry.thumbUrl = blob.url
    await saveMetadata(metadata)

    try {
      await updateProposalInPinecone(fileId, { thumbUrl: blob.url })
    } catch (pineconeErr) {
      console.warn('[POST admin thumbnail] Pinecone sync failed (JSON saved):', pineconeErr)
    }

    return NextResponse.json({ success: true, fileId, thumbUrl: blob.url })
  } catch (err) {
    console.error('[POST /api/admin/proposals/[id]/thumbnail]', err)
    const msg = err instanceof Error ? err.message : 'Thumbnail upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
