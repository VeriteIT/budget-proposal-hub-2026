/**
 * One-time migration: uploads the root JSON data stores to Vercel Blob so the
 * Blob-backed lib/*.ts modules have data to read on first deploy.
 *
 * Usage:  npm run seed-blob
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import fs from 'fs'
import { writeJsonBlob } from '@/lib/blob-store'

const FILES: { local: string; pathname: string }[] = [
  { local: 'dynamic_metadata.json', pathname: 'data/dynamic_metadata.json' },
  { local: 'categories.json',       pathname: 'data/categories.json' },
  { local: 'bm25_params.json',      pathname: 'data/bm25_params.json' },
  { local: 'chunk_corpus.json',     pathname: 'data/chunk_corpus.json' },
]

async function main() {
  for (const { local, pathname } of FILES) {
    const filePath = path.join(process.cwd(), local)
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP (not found): ${local}`)
      continue
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    await writeJsonBlob(pathname, data)
    console.log(`  OK: ${local} -> ${pathname}`)
  }
  console.log('\nDone.')
}

main().catch((err: unknown) => {
  console.error('seed-blob failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
