import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // Replace with your Trigger.dev project ref (Project settings -> Project ref)
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_iwiuqsblcbstbdmldaak',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 3600,
  dirs: ['./trigger'],
  build: {
    external: ['llamaindex', '@llamaindex/postgres', '@llamaindex/env', 'chromadb-default-embed', 'onnxruntime-node', '@aws-crypto/sha256-js'],
  },
})
