/**
 * Backfills existing Pinecone vectors with full multilingual metadata from dynamic_metadata.json.
 * Run once after deploying the updated ingest pipeline:
 *   npm run migrate
 *
 * Safe to re-run — vectors with no matching Pinecone chunks are skipped.
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { Pinecone } from '@pinecone-database/pinecone'
import { loadMetadata } from '@/lib/metadata'

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })

async function listChunkIds(
  index: ReturnType<typeof pc.index>,
  prefix: string,
): Promise<string[]> {
  const ids: string[] = []
  let paginationToken: string | undefined
  do {
    const page = await index.listPaginated({ prefix, limit: 100, paginationToken })
    ids.push(...((page.vectors ?? []).map((v) => v.id).filter((id): id is string => !!id)))
    paginationToken = page.pagination?.next
  } while (paginationToken)
  return ids
}

async function migrate() {
  const metadata = await loadMetadata()
  const entries = Object.entries(metadata)
  console.log(`Migrating ${entries.length} proposals to Pinecone with full metadata...\n`)

  const index = pc.index(process.env.PINECONE_INDEX_NAME!)
  let updated = 0
  let skipped = 0

  for (const [fileId, entry] of entries) {
    const chunkIds = await listChunkIds(index, `${fileId}_chunk_`)
    if (chunkIds.length === 0) {
      console.log(`  SKIP (no vectors): ${fileId}`)
      skipped++
      continue
    }

    // Fetch all chunk metadata so chunk-specific fields (text_preview, chunk_index) are preserved
    const allRecords: Record<string, Record<string, string | number>> = {}
    for (let i = 0; i < chunkIds.length; i += 100) {
      const fetched = await index.fetch(chunkIds.slice(i, i + 100))
      for (const [id, vec] of Object.entries(fetched.records)) {
        allRecords[id] = (vec.metadata ?? {}) as Record<string, string | number>
      }
    }

    const titleRec  = entry.title    as Record<string, string>
    const sumRec    = entry.summary  as Record<string, string>
    const catRec    = entry.category as Record<string, string>
    const costRec   = entry.costLKR  as Record<string, string>

    const extraFields: Record<string, string> = {
      title_en: titleRec.en ?? '',  title_si: titleRec.si ?? '',  title_ta: titleRec.ta ?? '',
      summary_en: sumRec.en ?? '',  summary_si: sumRec.si ?? '',  summary_ta: sumRec.ta ?? '',
      category_en: catRec.en ?? '', category_si: catRec.si ?? '', category_ta: catRec.ta ?? '',
      costLKR_en: costRec.en ?? '', costLKR_si: costRec.si ?? '', costLKR_ta: costRec.ta ?? '',
      badge: entry.badge ?? '',
      thumbUrl: entry.thumbUrl ?? '',
      added_date: entry.added_date ?? '',
    }

    await Promise.all(
      chunkIds.map(async (id) => {
        const current = allRecords[id] ?? {}
        await index.update({ id, metadata: { ...current, ...extraFields } })
      }),
    )

    console.log(`  OK (${chunkIds.length} chunks): ${fileId}`)
    updated++
  }

  console.log(`\nDone — ${updated} updated, ${skipped} skipped (not in Pinecone)`)
  if (skipped > 0) {
    console.log('Skipped proposals were not ingested yet. Run "npm run ingest <pdf>" to add them.')
  }
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
