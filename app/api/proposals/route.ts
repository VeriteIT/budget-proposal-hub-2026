import { NextRequest, NextResponse } from 'next/server'
import { getAllProposals } from '@/lib/metadata'
import type { Lang } from '@/types'

const SUPPORTED_LANGS = ['en', 'si', 'ta'] as const

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const rawLang = sp.get('lang')
    const lang: Lang = rawLang && (SUPPORTED_LANGS as readonly string[]).includes(rawLang)
      ? (rawLang as Lang)
      : 'en'
    const categoryFilter = sp.get('category')

    const proposals = await getAllProposals(lang, categoryFilter)
    return NextResponse.json({ proposals, total: proposals.length, language: lang })
  } catch (err) {
    console.error('[GET /api/proposals]', err)
    return NextResponse.json({ error: 'Failed to load proposals' }, { status: 500 })
  }
}
