import { google } from '@ai-sdk/google'

// Default provider — for generation (gemini-2.5-flash) and embeddings
export { google }

// Alias used by embedding call sites — kept as a named export for clarity
// @ai-sdk/google@3 fixes the embedContent issue that affected v1.x
export const googleEmbed = google
