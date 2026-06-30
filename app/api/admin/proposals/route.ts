import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { tasks } from '@trigger.dev/sdk/v3'
import { loadMetadata } from '@/lib/metadata'
import type { ManualMeta } from '@/lib/ingest-pipeline'
import type { ingestPdfTask } from '@/trigger/ingest-pdf'
import path from 'path'
import fs from 'fs'

const PDF_DIR = path.join(process.cwd(), 'public', 'assets', 'pdfs')

export async function GET() {
  try {
    const metadata = await loadMetadata()
    const proposals = Object.entries(metadata).map(([fileId, entry]) => ({
      fileId,
      title: entry.title,
      summary: entry.summary,
      category: entry.category,
      costLKR: entry.costLKR,
      badge: entry.badge ?? '',
      thumbUrl: entry.thumbUrl ?? '',
      added_date: entry.added_date ?? '',
      auto_generated: entry.auto_generated ?? false,
      vectorized: entry.vectorized ?? false,
      hasPdf: !!entry.pdfUrl || fs.existsSync(path.join(PDF_DIR, fileId)),
      pdfUrl: entry.pdfUrl ?? '',
    }))
    return NextResponse.json({ proposals })
  } catch (err) {
    console.error('[GET /api/admin/proposals]', err)
    return NextResponse.json({ error: 'Failed to load proposals' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    const badge = (formData.get('badge') as string | null) ?? 'New'

    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 })
    }

    // Build optional manual metadata — triggered when any language's title is provided
    const g = (key: string) => (formData.get(key) as string | null) ?? ''
    const titleEn = g('title_en'), titleSi = g('title_si'), titleTa = g('title_ta')
    const isManual = !!(titleEn || titleSi || titleTa)
    const meta: ManualMeta | undefined = isManual
      ? {
          title:    { en: titleEn,         si: titleSi,          ta: titleTa },
          summary:  { en: g('summary_en'),  si: g('summary_si'),  ta: g('summary_ta') },
          category: { en: g('category_en'), si: g('category_si'), ta: g('category_ta') },
          costLKR:  { en: g('costLKR_en'),  si: g('costLKR_si'),  ta: g('costLKR_ta') },
        }
      : undefined

    const buffer = Buffer.from(await file.arrayBuffer())
    const blob = await put(`pdfs/${file.name}`, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/pdf',
    })

    const thumbnail = formData.get('thumbnail') as File | null
    let thumbnailUrl: string | undefined
    if (thumbnail && thumbnail.type.startsWith('image/')) {
      const ext = thumbnail.name.split('.').pop() ?? 'jpg'
      const baseName = file.name.replace(/\.pdf$/i, '')
      const thumbBuffer = Buffer.from(await thumbnail.arrayBuffer())
      const thumbBlob = await put(`thumbs/${baseName}.${ext}`, thumbBuffer, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: thumbnail.type,
      })
      thumbnailUrl = thumbBlob.url
    }

    const handle = await tasks.trigger<typeof ingestPdfTask>('ingest-pdf', {
      pdfUrl: blob.url,
      filename: file.name,
      badge,
      meta,
      thumbnailUrl,
    })
    return NextResponse.json({ runId: handle.id })
  } catch (err) {
    console.error('[POST /api/admin/proposals]', err)
    const msg = err instanceof Error ? err.message : 'Ingestion failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
