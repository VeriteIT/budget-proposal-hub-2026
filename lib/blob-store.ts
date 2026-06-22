import { put, head } from '@vercel/blob'
import fs from 'fs'
import path from 'path'

// Generic JSON read/write helpers backed by Vercel Blob.
// Used for the app's mutable data stores (dynamic_metadata.json, categories.json,
// bm25_params.json, chunk_corpus.json), which can't be written to on Vercel's
// read-only deployment filesystem.
//
// When BLOB_READ_WRITE_TOKEN is not set (local dev without a Blob store),
// falls back to reading/writing the JSON files directly from the project root.

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN

// Maps blob pathname (e.g. "data/dynamic_metadata.json") to the
// equivalent local file at the project root ("dynamic_metadata.json").
function localPath(pathname: string): string {
  return path.join(process.cwd(), pathname.replace(/^data\//, ''))
}

export async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  if (!hasBlob()) {
    try {
      const raw = fs.readFileSync(localPath(pathname), 'utf-8')
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }
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
  if (!hasBlob()) {
    fs.writeFileSync(localPath(pathname), JSON.stringify(data, null, 2), 'utf-8')
    return
  }
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}
