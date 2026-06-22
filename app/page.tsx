import { redirect } from 'next/navigation'

// Bare / redirects to /en (middleware also handles this, this is a fallback)
export default function RootPage() {
  redirect('/en')
}
