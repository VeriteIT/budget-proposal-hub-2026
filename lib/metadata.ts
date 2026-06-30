import type { BM25Document } from '@/lib/bm25'
import type { Lang, DynamicMetadata, MetadataEntry, ProposalResult } from '@/types'
import { loadCategories, resolveCategoryHex } from '@/lib/categories'
import { readJsonBlob, writeJsonBlob } from '@/lib/blob-store'

const METADATA_PATH = 'data/dynamic_metadata.json'

export async function loadMetadata(): Promise<DynamicMetadata> {
  return readJsonBlob<DynamicMetadata>(METADATA_PATH, {})
}

export async function saveMetadata(data: DynamicMetadata): Promise<void> {
  await writeJsonBlob(METADATA_PATH, data)
}

// New uploads store a full Blob URL in entry.pdfUrl/thumbUrl; existing
// proposals fall back to the static files shipped in public/assets/.
export function resolvePdfUrl(entry: MetadataEntry, fileId: string): string {
  return entry.pdfUrl ?? `/assets/pdfs/${fileId}`
}

export function resolveThumbUrl(entry: MetadataEntry): string {
  if (!entry.thumbUrl) return ''
  return entry.thumbUrl.startsWith('http') ? entry.thumbUrl : `/assets/thumbs/${entry.thumbUrl}`
}

// Placeholder strings written for language versions that have no real content
const PLACEHOLDERS = new Set([
  'Unknown', 'No summary available', 'No Costing Available', 'Uncategorized',
  'No data available', 'Not available', 'N/A',
])

export function getField(
  entry: MetadataEntry,
  field: keyof MetadataEntry,
  lang: Lang,
): string {
  const val = entry[field]
  let raw = ''
  if (typeof val === 'string') raw = val
  else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    raw = (val as Record<string, string>)[lang] ?? ''
  }
  return PLACEHOLDERS.has(raw.trim()) ? '' : raw
}

export async function buildCorpus(lang: Lang): Promise<BM25Document[]> {
  const metadata = await loadMetadata()
  return Object.entries(metadata)
    .map(([id, entry]) => {
      const title = getField(entry, 'title', lang)
      const summary = getField(entry, 'summary', lang)
      const category = getField(entry, 'category', lang)
      if (!title || !summary) return null
      return { id, text: [title, summary, category].join(' ') }
    })
    .filter((d): d is BM25Document => d !== null)
}

export async function getAllProposals(
  lang: Lang,
  categoryFilter?: string | null,
): Promise<ProposalResult[]> {
  const metadata = await loadMetadata()
  const categoryMap = await loadCategories()

  return Object.entries(metadata)
    .map(([fileId, entry]): ProposalResult | null => {
      const title = getField(entry, 'title', lang)
      const summary = getField(entry, 'summary', lang)
      const category = getField(entry, 'category', lang)
      const costLKR = getField(entry, 'costLKR', lang)

      if (!title || !summary) return null
      if (categoryFilter && categoryFilter !== 'All categories' && category !== categoryFilter) {
        return null
      }

      return {
        title,
        summary,
        costLKR,
        category,
        categoryEn: getField(entry, 'category', 'en'),
        categoryHex: resolveCategoryHex(categoryMap, {
          en: getField(entry, 'category', 'en'),
          si: getField(entry, 'category', 'si'),
          ta: getField(entry, 'category', 'ta'),
        }),
        badge: entry.badge ?? '',
        pdfUrl: fileId ? resolvePdfUrl(entry, fileId) : '',
        thumbUrl: resolveThumbUrl(entry),
        score: 1.0,
        relevance_percentage: 100,
        file_path: fileId,
      } satisfies ProposalResult
    })
    .filter((p): p is ProposalResult => p !== null)
}
