import { NextRequest, NextResponse } from 'next/server'
import { SUPPORTED_LANGS } from '@/types'

const ADMIN_COOKIE = 'admin_session'

async function expectedToken(): Promise<string> {
  const password = process.env.ADMIN_PASSWORD ?? ''
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Admin auth guard ──
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = req.cookies.get(ADMIN_COOKIE)?.value
    const token  = await expectedToken()
    if (cookie !== token) {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Skip API routes and static files
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
