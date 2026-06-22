import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // Replace with your Trigger.dev project ref (Project settings -> Project ref)
  project: process.env.TRIGGER_PROJECT_REF ?? '<your-project-ref>',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 3600,
  dirs: ['./trigger'],
})
