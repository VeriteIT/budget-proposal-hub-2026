export type Lang = 'en' | 'si' | 'ta'

export const SUPPORTED_LANGS: Lang[] = ['en', 'si', 'ta']

export interface CategoryDef {
  color: string  // CSS class suffix: blue, yellow, red, green, teal, purple, gray
  hex: string    // actual hex for card headers
  si?: string    // localised category name (Sinhala) for colour matching
  ta?: string    // localised category name (Tamil) for colour matching
}

export type CategoryMap = Record<string, CategoryDef>

export interface ProposalResult {
  title: string
  summary: string
  costLKR: string
  category: string
  categoryEn: string   // always English — used for colour lookup
  categoryHex?: string // resolved colour for the card header gradient
  badge: string
  pdfUrl: string
  thumbUrl: string
  score: number
  relevance_percentage: number
  file_path: string
  id?: string
  excerpt?: string // raw text from the proposal's best-matching chunks (only set when requested)
}

export interface SearchResponse {
  query: string
  results: ProposalResult[]
  total_results: number
  category_filter?: string | null
  language: Lang
}

// Shape of each entry in dynamic_metadata.json
export interface MetadataEntry {
  title: string | Record<Lang, string>
  summary: string | Record<Lang, string>
  category: string | Record<Lang, string>
  costLKR: string | Record<Lang, string>
  badge: string
  thumbUrl: string
  pdfUrl?: string
  added_date?: string
  auto_generated?: boolean
  vectorized?: boolean
}

export type DynamicMetadata = Record<string, MetadataEntry>
