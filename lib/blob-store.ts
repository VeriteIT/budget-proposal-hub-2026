import { put, head } from '@vercel/blob'

// Generic JSON read/write helpers backed by Vercel Blob.
// Used for the app's mutable data stores (dynamic_metadata.json, categories.json,
// bm25_params.json, chunk_corpus.json), which can't be written to on Vercel's
// read-only deployment filesystem.

export async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  try {
    const { url } = await head(pathname)
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export async function writeJsonBlob<T>(pathname: string, data: T): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}
