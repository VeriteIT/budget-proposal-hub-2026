import { NextRequest, NextResponse } from 'next/server'
import { loadCategories, saveCategories } from '@/lib/categories'

export async function GET() {
  return NextResponse.json(await loadCategories())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string; color?: string; hex?: string }
    const name  = (body.name  ?? '').trim()
    const color = (body.color ?? '').trim()
    const hex   = (body.hex   ?? '').trim()

    if (!name)  return NextResponse.json({ error: 'Name is required' },  { status: 400 })
    if (!color) return NextResponse.json({ error: 'Color is required' }, { status: 400 })
    if (!hex)   return NextResponse.json({ error: 'Hex is required' },   { status: 400 })

    const cats = await loadCategories()
    cats[name] = { color, hex }
    await saveCategories(cats)
    return NextResponse.json({ success: true, name, color, hex })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string }
    const name = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const cats = await loadCategories()
    if (!cats[name]) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    delete cats[name]
    await saveCategories(cats)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
