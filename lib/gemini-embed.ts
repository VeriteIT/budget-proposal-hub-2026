import { GoogleGenAI } from '@google/genai'

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!_client) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required')
    }
    _client = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
  }
  return _client
}

export async function embedText(text: string): Promise<number[]> {
  const MAX_RETRIES = 5
  let delay = 10000 // start at 10 s for 429s

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
        config: { outputDimensionality: 768 },
      })
      const values = response.embeddings?.[0]?.values
      if (!values) throw new Error('No embedding returned from gemini-embedding-2')
      return values
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
      if (is429 && attempt < MAX_RETRIES) {
        console.warn(`  [embed] rate limited — waiting ${delay / 1000}s (attempt ${attempt}/${MAX_RETRIES})`)
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2 // exponential backoff: 10s, 20s, 40s, 80s
      } else {
        throw err
      }
    }
  }
  throw new Error('embedText: max retries exceeded')
}
