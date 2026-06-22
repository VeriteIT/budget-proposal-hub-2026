// Simple in-memory sliding-window rate limiter, keyed by client IP.
// Resets on server restart — fine for a single-instance Next.js deployment.

const WINDOW_MS = 60_000 // 1 minute
const MAX_REQUESTS = 10   // per IP per window

const hits = new Map<string, number[]>()

export function isRateLimited(key: string): boolean {
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)

  if (timestamps.length >= MAX_REQUESTS) {
    hits.set(key, timestamps)
    return true
  }

  timestamps.push(now)
  hits.set(key, timestamps)
  return false
}

export function getClientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}
