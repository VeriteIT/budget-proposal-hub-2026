import { task } from '@trigger.dev/sdk/v3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { ingestPdf, type ManualMeta } from '@/lib/ingest-pipeline'

export interface IngestPdfPayload {
  pdfUrl: string
  filename: string
  badge?: string
  meta?: ManualMeta
}

export const ingestPdfTask = task({
  id: 'ingest-pdf',
  maxDuration: 900,
  run: async (payload: IngestPdfPayload) => {
    const res = await fetch(payload.pdfUrl)
    if (!res.ok) throw new Error(`Failed to download PDF (${res.status}): ${payload.pdfUrl}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const tmpPath = path.join(os.tmpdir(), payload.filename)
    fs.writeFileSync(tmpPath, buffer)

    try {
      const { fileId, entry } = await ingestPdf(tmpPath, {
        badge: payload.badge,
        meta: payload.meta,
        log: (msg) => console.log(msg),
      })
      return { fileId, entry }
    } finally {
      fs.unlinkSync(tmpPath)
    }
  },
})
