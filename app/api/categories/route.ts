import { NextRequest, NextResponse } from 'next/server'
import { loadMetadata, getField } from '@/lib/metadata'
import type { Lang } from '@/types'

const SUPPORTED_LANGS = ['en', 'si', 'ta'] as const

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const rawLang = sp.get('lang')
    const lang: Lang = rawLang && (SUPPORTED_LANGS as readonly string[]).includes(rawLang)
      ? (rawLang as Lang)
      : 'en'

    const metadata = await loadMetadata()
    const seen = new Set<string>()

    for (const entry of Object.values(metadata)) {
      const cat = getField(entry, 'category', lang)
      if (cat) seen.add(cat)
    }

    const categories = ['All categories', ...Array.from(seen).sort()]
    return NextResponse.json({ categories, language: lang })
  } catch (err) {
    console.error('[GET /api/categories]', err)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }
}
