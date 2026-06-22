import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { ingestPdf } from '@/lib/ingest-pipeline'

const pdfArg = process.argv[2]
if (!pdfArg) {
  console.error('Usage: npm run ingest <path-to-pdf>')
  console.error('Example: npm run ingest "public/assets/pdfs/proposal.pdf"')
  process.exit(1)
}

ingestPdf(path.resolve(pdfArg), { log: console.log })
  .then(({ fileId, entry }) => {
    console.log(`\nDone!`)
    console.log(`  File:     ${fileId}`)
    console.log(`  Title:    ${(entry.title as Record<string, string>).en}`)
    console.log(`  Category: ${(entry.category as Record<string, string>).en}`)
  })
  .catch((err: unknown) => {
    console.error('\nIngestion failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
