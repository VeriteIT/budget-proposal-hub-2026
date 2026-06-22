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
  starters: string[]
}> = {
  en: {
    title: 'Budget Proposals Assistant',
    placeholder: 'Ask about a budget proposal…',
    greeting: 'Hi! Ask me about any budget proposal — costs, categories, or topics.',
    send: 'Send',
    thinking: 'Thinking…',
    searching: 'Searching proposals…',
    error: 'Something went wrong. Please try again.',
    clear: 'Clear chat',
    sources: 'Related proposals',
    starters: [
      'What proposals are related to healthcare?',
      'What are the education sector proposals?',
      'Tell me about economic growth proposals',
      'What governance reforms are proposed?',
    ],
  },
  si: {
    title: 'අයවැය යෝජනා සහායක',
    placeholder: 'අයවැය යෝජනාවක් ගැන විමසන්න…',
    greeting: 'හායි! ඕනෑම අයවැය යෝජනාවක් ගැන — වැය, කාණ්ඩ, හෝ මාතෘකා ගැන මගෙන් අසන්න.',
    send: 'යවන්න',
    thinking: 'සිතමින්…',
    searching: 'යෝජනා සොයමින්…',
    error: 'දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.',
    clear: 'සංවාදය හිස් කරන්න',
    sources: 'සම්බන්ධිත යෝජනා',
    starters: [
      'සෞඛ්‍ය සේවා සම්බන්ධ යෝජනා මොනවාද?',
      'අධ්‍යාපන අංශයේ යෝජනා මොනවාද?',
      'ආර්ථික වර්ධන යෝජනා ගැන කියන්න',
      'පාලන ප්‍රතිසංස්කරණ යෝජනා මොනවාද?',
    ],
  },
  ta: {
    title: 'பட்ஜெட் முன்மொழிவு உதவியாளர்',
    placeholder: 'ஒரு பட்ஜெட் முன்மொழிவைப் பற்றி கேளுங்கள்…',
    greeting: 'வணக்கம்! எந்த பட்ஜெட் முன்மொழிவைப் பற்றியும் — செலவு, வகை, அல்லது தலைப்புகள் — என்னிடம் கேளுங்கள்.',
    send: 'அனுப்பு',
    thinking: 'சிந்திக்கிறது…',
    searching: 'முன்மொழிவுகளைத் தேடுகிறது…',
    error: 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
    clear: 'உரையாடலை அழி',
    sources: 'தொடர்புடைய முன்மொழிவுகள்',
    starters: [
      'சுகாதாரம் தொடர்பான முன்மொழிவுகள் என்ன?',
      'கல்வித் துறை முன்மொழிவுகள் என்ன?',
      'பொருளாதார வளர்ச்சி முன்மொழிவுகள் பற்றி கூறுங்கள்',
      'ஆட்சி சீர்திருத்த முன்மொழிவுகள் என்ன?',
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
          height: 460,
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
              <>
                <div style={{ fontSize: 13, color: '#606772', lineHeight: 1.5 }}>{t.greeting}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {t.starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendStarter(q)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid #e6e8ee',
                        background: '#ffffff',
                        color: '#0d2a4a',
                        fontSize: 12.5,
                        lineHeight: 1.4,
                        cursor: 'pointer',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
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
                          href={`/${s.pdfUrl}`}
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
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: '#0d2a4a',
          color: '#fff',
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(13,42,74,.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          float: 'right',
        }}
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}
