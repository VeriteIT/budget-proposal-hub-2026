import { getPineconeIndex } from '@/lib/pinecone-client'

export interface AdminProposal {
  fileId: string
  title: { en: string; si: string; ta: string }
  summary: { en: string; si: string; ta: string }
  category: { en: string; si: string; ta: string }
  costLKR: { en: string; si: string; ta: string }
  badge: string
  thumbUrl: string
  added_date: string
}

async function listChunkIds(prefix?: string): Promise<string[]> {
  const index = getPineconeIndex()
  const ids: string[] = []
  let paginationToken: string | undefined
  do {
    const page = await index.listPaginated({ prefix, limit: 100, paginationToken })
    ids.push(...((page.vectors ?? []).map((v) => v.id).filter((id): id is string => !!id)))
    paginationToken = page.pagination?.next
  } while (paginationToken)
  return ids
}

export async function listProposalsFromPinecone(): Promise<AdminProposal[]> {
  const allIds = await listChunkIds()
  const chunk0Ids = allIds.filter((id) => /_chunk_0$/.test(id))
  if (chunk0Ids.length === 0) return []

  const index = getPineconeIndex()
  const results: AdminProposal[] = []

  for (let i = 0; i < chunk0Ids.length; i += 100) {
    const fetched = await index.fetch(chunk0Ids.slice(i, i + 100))
    for (const vec of Object.values(fetched.records)) {
      const m = (vec.metadata ?? {}) as Record<string, string>
      if (!m.file_path || !m.title_en) continue
      results.push({
        fileId: m.file_path,
        title:    { en: m.title_en ?? '',     si: m.title_si ?? '',    ta: m.title_ta ?? '' },
        summary:  { en: m.summary_en ?? '',   si: m.summary_si ?? '',  ta: m.summary_ta ?? '' },
        category: { en: m.category_en ?? m.category ?? '', si: m.category_si ?? '', ta: m.category_ta ?? '' },
        costLKR:  { en: m.costLKR_en ?? '',   si: m.costLKR_si ?? '',  ta: m.costLKR_ta ?? '' },
        badge:    m.badge ?? '',
        thumbUrl: m.thumbUrl ?? '',
        added_date: m.added_date ?? '',
      })
    }
  }

  return results
}

export async function updateProposalInPinecone(
  fileId: string,
  fields: Partial<Omit<AdminProposal, 'fileId'>>,
): Promise<void> {
  const chunkIds = await listChunkIds(`${fileId}_chunk_`)
  if (chunkIds.length === 0) return // Not yet in Pinecone — JSON-only entry

  const index = getPineconeIndex()

  // Fetch all chunk metadata in batches
  const allRecords: Record<string, Record<string, string | number>> = {}
  for (let i = 0; i < chunkIds.length; i += 100) {
    const fetched = await index.fetch(chunkIds.slice(i, i + 100))
    for (const [id, vec] of Object.entries(fetched.records)) {
      allRecords[id] = (vec.metadata ?? {}) as Record<string, string | number>
    }
  }

  // Update each chunk vector: merge chunk-specific fields with updated shared fields
  await Promise.all(
    chunkIds.map(async (id) => {
      const current = allRecords[id] ?? {}
      const updated: Record<string, string | number> = { ...current }
      if (fields.title) {
        updated.title_en = fields.title.en
        updated.title_si = fields.title.si
        updated.title_ta = fields.title.ta
      }
      if (fields.summary) {
        updated.summary_en = fields.summary.en
        updated.summary_si = fields.summary.si
        updated.summary_ta = fields.summary.ta
      }
      if (fields.category) {
        updated.category    = fields.category.en
        updated.category_en = fields.category.en
        updated.category_si = fields.category.si
        updated.category_ta = fields.category.ta
      }
      if (fields.costLKR) {
        updated.costLKR_en = fields.costLKR.en
        updated.costLKR_si = fields.costLKR.si
        updated.costLKR_ta = fields.costLKR.ta
      }
      if (fields.badge !== undefined) updated.badge = fields.badge
      if (fields.thumbUrl !== undefined) updated.thumbUrl = fields.thumbUrl
      await index.update({ id, metadata: updated })
    }),
  )
}

export async function deleteProposalFromPinecone(fileId: string): Promise<void> {
  const chunkIds = await listChunkIds(`${fileId}_chunk_`)
  if (chunkIds.length === 0) return
  const index = getPineconeIndex()
  for (let i = 0; i < chunkIds.length; i += 100) {
    await index.deleteMany(chunkIds.slice(i, i + 100))
  }
}
