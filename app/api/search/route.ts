import { NextRequest, NextResponse } from 'next/server'
import { hybridSearch } from '@/lib/hybrid-search'
import { getAllProposals } from '@/lib/metadata'
import type { Lang, SearchResponse } from '@/types'

const SUPPORTED_LANGS = ['en', 'si', 'ta'] as const

function parseLang(raw: string | null): Lang {
  if (raw && (SUPPORTED_LANGS as readonly string[]).includes(raw)) return raw as Lang
  return 'en'
}

async function runSearch(
  query: string | null,
  lang: Lang,
  categoryFilter: string | null,
): Promise<SearchResponse> {
  if (query && query.trim().length > 0) {
    const results = await hybridSearch(query.trim(), lang, categoryFilter)
    return { query: query.trim(), results, total_results: results.length, category_filter: categoryFilter, language: lang }
  }
  const results = await getAllProposals(lang, categoryFilter)
  return { query: '', results, total_results: results.length, category_filter: categoryFilter, language: lang }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const data = await runSearch(sp.get('q'), parseLang(sp.get('lang')), sp.get('category'))
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const query = typeof body.query === 'string' ? body.query : null
    const lang = parseLang(typeof body.lang === 'string' ? body.lang : null)
    const categoryFilter = typeof body.categoryFilter === 'string' ? body.categoryFilter : null
    const data = await runSearch(query, lang, categoryFilter)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[POST /api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
