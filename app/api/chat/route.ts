import { streamText, convertToModelMessages, tool, jsonSchema, stepCountIs, type UIMessage } from 'ai'
import { google } from '@/lib/google-ai'
import { hybridSearch } from '@/lib/hybrid-search'
import { isRateLimited, getClientKey } from '@/lib/rate-limit'
import type { Lang } from '@/types'

export const maxDuration = 60

const SUPPORTED_LANGS = ['en', 'si', 'ta'] as const

function parseLang(raw: unknown): Lang {
  if (typeof raw === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(raw)) return raw as Lang
  return 'en'
}

const MAX_HISTORY_MESSAGES = 12

const SYSTEM_PROMPT = `You are a helpful assistant for the Budget Proposals Hub, which covers Sri Lanka's national budget proposals.

You have access to a "searchProposals" tool that searches a vector database containing detailed information about budget proposals (titles, summaries, categories, and estimated costs in LKR), along with an "excerpt" field containing the full raw text of the proposal document.

Language:
- You can communicate fluently in English, Sinhala, and Tamil.
- You also understand Singlish (Sinhala typed in English letters) and Tanglish (Tamil typed in English letters).
- Always reply in the same language the user wrote in. If they write in Singlish or Tanglish, reply in proper Sinhala or Tamil script unless they ask for romanised text.

Grounding rules:
- For any question about specific proposals, policies, costs, categories, or budget figures, call searchProposals before answering. Do not rely on memory for these facts.
- Base your answer only on the information returned by searchProposals. Never invent costs, titles, or details that are not in the results.
- If the user asks for a specific figure, statistic, timeline, beneficiary count, or any other detail that isn't in the summary, check the "excerpt" field of the relevant result — it contains the full text of the proposal document and will have these details. Quote or paraphrase from it directly.
- When you reference a proposal, mention its title so the user can find it. The app will automatically show a link to the source document below your reply, so do not include URLs or filenames yourself.
- If searchProposals returns no relevant results, say so clearly and suggest the user rephrase or browse the proposals list — do not guess.
- You may answer general questions (greetings, how the site works, etc.) without calling the tool.

Formatting:
- Reply in plain text only. Do not use markdown formatting such as **bold**, *italics*, headings, or bullet/numbered lists with markdown syntax — write normal sentences and paragraphs.

Keep responses concise and easy to read.`

export async function POST(req: Request) {
  const clientKey = getClientKey(req)
  if (isRateLimited(clientKey)) {
    return new Response(JSON.stringify({ error: 'Too many requests — please wait a moment and try again.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as { messages: UIMessage[]; lang?: string }
    const lang = parseLang(body.lang)
    const messages = (body.messages ?? []).slice(-MAX_HISTORY_MESSAGES)

    const searchProposals = tool({
      description:
        'Search the Sri Lanka budget proposals database for proposals relevant to a topic, query, or keyword. Returns matching proposals with their title, summary, category, and estimated cost.',
      inputSchema: jsonSchema<{ query: string; category?: string }>({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A search query describing what the user wants to know about (topic, sector, or keyword).',
          },
          category: {
            type: 'string',
            description: 'Optional category name to filter results, e.g. "Healthcare", "Education", "Infrastructure".',
          },
        },
        required: ['query'],
      }),
      execute: async ({ query, category }) => {
        const results = await hybridSearch(query, lang, category ?? null, { includeExcerpts: true })
        return results.map((r) => ({
          title: r.title,
          summary: r.summary,
          category: r.category,
          costLKR: r.costLKR,
          pdfUrl: r.pdfUrl,
          excerpt: r.excerpt,
        }))
      },
    })

    const result = streamText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: { searchProposals },
      stopWhen: stepCountIs(4),
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    console.error('[POST /api/chat]', err)
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
