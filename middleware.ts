import { NextRequest, NextResponse } from 'next/server'
import { SUPPORTED_LANGS } from '@/types'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip API routes, admin, and static files
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Redirect bare / to /en
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/en', req.url))
  }

  // Validate lang segment — redirect unknown langs to /en
  const [, lang] = pathname.split('/')
  if (lang && !SUPPORTED_LANGS.includes(lang as any)) {
    return NextResponse.redirect(new URL('/en', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
