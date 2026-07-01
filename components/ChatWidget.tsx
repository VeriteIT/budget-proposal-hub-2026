'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { Lang } from '@/types'

interface ProposalSource {
  title: string
  pdfUrl: string
}

const TEXT: Record<Lang, {
  title: string
  placeholder: string
  greeting: string
  send: string
  thinking: string
  searching: string
  error: string
  clear: string
  sources: string
  askBtn: string
  starters: string[]
}> = {
  en: {
    title: 'Budget Assistant',
    placeholder: 'Ask about a budget proposal…',
    greeting: '👋 Hi! I\'m your Budget Assistant. I can help you understand the budget proposals, answer questions about specific policies, and guide you through the proposals. What would you like to know?',
    send: 'Send',
    thinking: 'Thinking…',
    searching: 'Searching proposals…',
    error: 'Something went wrong. Please try again.',
    clear: 'Clear chat',
    sources: 'Related proposals',
    askBtn: 'Ask Assistant',
    starters: [
      'What reforms are proposed for the EPF?',
      'What anti-corruption and transparency proposals are there?',
      'What proposals would help Sri Lanka\'s exports and trade competitiveness?',
    ],
  },
  si: {
    title: 'අයවැය යෝජනා සහායක',
    placeholder: 'අයවැය යෝජනාවක් ගැන විමසන්න…',
    greeting: '👋 ආයුබෝවන්! මම ඔබේ අයවැය සහායකයා (Budget Assistant). අයවැය යෝජනා අවබෝධ කර ගැනීමට, නිශ්චිත ප්‍රතිපත්ති පිළිබඳ ප්‍රශ්නවලට පිළිතුරු දීමට සහ යෝජනා පිළිබඳව ඔබට මඟ පෙන්වීමට මට උපකාර කළ හැක. ඔබ දැනගැනීමට කැමති කුමක්ද?',
    send: 'යවන්න',
    thinking: 'සිතමින්…',
    searching: 'යෝජනා සොයමින්…',
    error: 'දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.',
    clear: 'සංවාදය හිස් කරන්න',
    sources: 'සම්බන්ධිත යෝජනා',
    askBtn: 'සහායකයාගෙන් අසන්න',
    starters: [
      'EPF (සේවක අර්ථසාධක අරමුදල) සඳහා යෝජිත ප්‍රතිසංස්කරණ මොනවාද?',
      'දූෂණ මර්දන සහ විනිවිදභාවය පිළිබඳ ඇති යෝජනා මොනවාද?',
      'ශ්‍රී ලංකාවේ අපනයන සහ වෙළෙඳ තරගකාරීත්වය නැංවීමට උපකාර වන යෝජනා මොනවාද?',
    ],
  },
  ta: {
    title: 'பட்ஜெட் முன்மொழிவு உதவியாளர்',
    placeholder: 'ஒரு பட்ஜெட் முன்மொழிவைப் பற்றி கேளுங்கள்…',
    greeting: '👋 வணக்கம்! நான் உங்கள் வரவுசெலவுத் திட்ட உதவியாளர் (Budget Assistant). வரவுசெலவுத் திட்ட முன்மொழிவுகளைப் புரிந்துகொள்ளவும், குறிப்பிட்ட கொள்கைகள் பற்றிய கேள்விகளுக்குப் பதிலளிக்கவும், இந்த முன்மொழிவுகள் குறித்து உங்களை வழிநடத்தவும் என்னால் உதவ முடியும். நீங்கள் எதைப் பற்றி அறிந்துகொள்ள விரும்புகிறீர்கள்?',
    send: 'அனுப்பு',
    thinking: 'சிந்திக்கிறது…',
    searching: 'முன்மொழிவுகளைத் தேடுகிறது…',
    error: 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
    clear: 'உரையாடலை அழி',
    sources: 'தொடர்புடைய முன்மொழிவுகள்',
    askBtn: 'உதவியாளரிடம் கேளுங்கள்',
    starters: [
      'EPF (ஊழியர் சேமலாப நிதியம்) தொடர்பில் முன்மொழியப்பட்டுள்ள சீர்திருத்தங்கள் யாவை?',
      'ஊழல் தடுப்பு மற்றும் வெளிப்படைத்தன்மை தொடர்பான முன்மொழிவுகள் என்னென்ன உள்ளன?',
      'இலங்கையின் ஏற்றுமதி மற்றும் வர்த்தகப் போட்டித்தன்மைக்கு உதவும் முன்மொழிவுகள் யாவை?',
    ],
  },
}

interface Props {
  lang: Lang
}

export function ChatWidget({ lang }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const t = TEXT[lang]

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { lang },
    }),
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || status === 'streaming' || status === 'submitted') return
    sendMessage({ text })
    setInput('')
  }

  function sendStarter(text: string) {
    if (status === 'streaming' || status === 'submitted') return
    sendMessage({ text })
  }

  const busy = status === 'streaming' || status === 'submitted'
  const isSearching = busy && messages.at(-1)?.parts?.some(
    (p) => p.type.startsWith('tool-') && (p as { state?: string }).state !== 'output-available',
  )

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1000, fontFamily: 'inherit' }}>
      {open && (
        <div style={{
          width: 340,
          maxWidth: 'calc(100vw - 40px)',
          height: 520,
          maxHeight: 'calc(100vh - 100px)',
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,.18)',
          border: '1px solid #e6e8ee',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          marginBottom: 12,
        }}>
          <div style={{
            background: '#0d2a4a',
            color: '#fff',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title={t.clear}
                  aria-label={t.clear}
                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 4, opacity: 0.8 }}
                >🗑️</button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}
              >✕</button>
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: '#f6f8fb' }}>
            {messages.length === 0 && (
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e6e8ee',
                padding: '12px 14px',
                fontSize: 13,
                color: '#0b1021',
                lineHeight: 1.6,
              }}>{t.greeting}</div>
            )}
            {messages.map((m) => {
              const text = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => (p as { text: string }).text)
                .join('')

              const sources: ProposalSource[] = []
              for (const p of m.parts) {
                if (p.type === 'tool-searchProposals' && (p as { state?: string }).state === 'output-available') {
                  const output = (p as { output?: unknown }).output
                  if (Array.isArray(output)) {
                    for (const item of output) {
                      if (sources.length >= 3) break
                      if (item && typeof item === 'object' && 'title' in item && 'pdfUrl' in item) {
                        const { title, pdfUrl } = item as { title: string; pdfUrl: string }
                        if (title && pdfUrl && !sources.some((s) => s.pdfUrl === pdfUrl)) {
                          sources.push({ title, pdfUrl })
                        }
                      }
                    }
                  }
                }
              }

              if (!text && sources.length === 0) return null
              const isUser = m.role === 'user'
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 6 }}>
                  {text && (
                    <div style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      background: isUser ? '#0d2a4a' : '#ffffff',
                      color: isUser ? '#ffffff' : '#0b1021',
                      border: isUser ? 'none' : '1px solid #e6e8ee',
                    }}>
                      {text}
                    </div>
                  )}
                  {sources.length > 0 && (
                    <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: '#606772', fontWeight: 600 }}>{t.sources}</span>
                      {sources.map((s) => (
                        <a
                          key={s.pdfUrl}
                          href={s.pdfUrl.startsWith('http') ? s.pdfUrl : `/${s.pdfUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: '#288e76',
                            textDecoration: 'none',
                            border: '1px solid #e6e8ee',
                            borderRadius: 8,
                            padding: '6px 10px',
                            background: '#ffffff',
                            lineHeight: 1.4,
                          }}
                        >
                          📄 {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {busy && (
              <div style={{ fontSize: 12, color: '#606772', fontStyle: 'italic' }}>
                {isSearching ? t.searching : t.thinking}
              </div>
            )}
            {error && (
              <div style={{ fontSize: 12, color: '#dc2626' }}>{t.error}</div>
            )}
          </div>

          {messages.length === 0 && (
            <div style={{ padding: '6px 10px 4px', borderTop: '1px solid #e6e8ee', background: '#fff', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {t.starters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendStarter(q)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 20,
                    border: '1px solid #c8d0dc',
                    background: '#f0f4f8',
                    color: '#0d2a4a',
                    fontSize: 11.5,
                    lineHeight: 1.4,
                    cursor: 'pointer',
                    whiteSpace: 'normal',
                    textAlign: 'left',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #e6e8ee', background: '#fff' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.placeholder}
              disabled={busy}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #e6e8ee',
                fontSize: 13,
                outline: 'none',
                background: busy ? '#f6f8fb' : '#fff',
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#288e76',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: busy || !input.trim() ? 'default' : 'pointer',
                opacity: busy || !input.trim() ? 0.6 : 1,
              }}
            >
              {t.send}
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.title}
        style={{
          height: 44,
          paddingLeft: 16,
          paddingRight: 20,
          borderRadius: 999,
          border: 'none',
          background: '#288e76',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(40,142,118,.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          float: 'right',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {open ? '×' : t.askBtn}
      </button>
    </div>
  )
}
