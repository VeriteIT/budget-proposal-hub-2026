import { readJsonBlob, writeJsonBlob } from '@/lib/blob-store'

export interface CategoryDef {
  color: string  // CSS class suffix: blue, yellow, red, green, teal, purple, gray
  hex: string    // actual hex for inline use
  si?: string    // localised category name (Sinhala) for colour matching
  ta?: string    // localised category name (Tamil) for colour matching
}

export type CategoryMap = Record<string, CategoryDef>

const CATEGORIES_PATH = 'data/categories.json'

export async function loadCategories(): Promise<CategoryMap> {
  return readJsonBlob<CategoryMap>(CATEGORIES_PATH, {})
}

export async function saveCategories(data: CategoryMap): Promise<void> {
  await writeJsonBlob(CATEGORIES_PATH, data)
}

/**
 * Resolve a category's colour hex by matching its English name against the
 * categoryMap keys, or its Sinhala/Tamil name against each entry's si/ta fields.
 * This lets proposals uploaded in only one language still get a colour.
 */
export function resolveCategoryHex(
  categoryMap: CategoryMap,
  category: { en?: string; si?: string; ta?: string },
): string | undefined {
  const en = (category.en ?? '').trim().toLowerCase()
  const si = (category.si ?? '').trim()
  const ta = (category.ta ?? '').trim()

  for (const [name, def] of Object.entries(categoryMap)) {
    if (en && name.toLowerCase() === en) return def.hex
    if (si && def.si === si) return def.hex
    if (ta && def.ta === ta) return def.hex
  }
  return undefined
}
