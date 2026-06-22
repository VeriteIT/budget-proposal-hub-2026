'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ProposalCard } from './ProposalCard'
import type { Lang, ProposalResult } from '@/types'

function adjustHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, (n >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

type TabId = 'formulated-proposals' | 'budget-concepts' | 'other-proposals'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'formulated-proposals', label: 'Formulated Budget Proposals',      icon: '/assets/images/Proposals.png' },
  { id: 'budget-concepts',      label: 'Concepts for Budget Proposals',    icon: '/assets/images/Concepts.png'  },
  { id: 'other-proposals',      label: 'Budget Proposals on other sites',  icon: '/assets/images/Proposals.png' },
]

const PLACEHOLDER: Record<Lang, string> = {
  en: 'e.g. customs single window, school meals, roads…',
  si: 'e.g. රීතිවල, ශිෂ්‍ය ආහාර, මාර්ග…',
  ta: 'எ.கா. சுங்க ஒற்றை சாளரம், பள்ளி உணவு, சாலைகள்…',
}

interface Props {
  lang: Lang
  initialProposals: ProposalResult[]
  initialCategories: string[]
  localisedCategoryMap: Record<string, { hex: string; enName: string }>
}

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="concepts-container">
      <div className="concepts-placeholder">
        <div className="placeholder-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity={0.3}>
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
            <path d="M3 13h18c.552 0 1 .448 1 1v5c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-5c0-.552.448-1 1-1z"/>
          </svg>
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      </div>
    </div>
  )
}

export function ProposalsClient({ lang, initialProposals, initialCategories, localisedCategoryMap }: Props) {
  const [activeTab, setActiveTab]     = useState<TabId>('formulated-proposals')
  const [searchResults, setSearchResults] = useState<ProposalResult[] | null>(null)
  const [loading, setLoading]         = useState(false)
  const [query, setQuery]             = useState('')
  const [selected, setSelected]       = useState<Set<string>>(new Set(['All categories']))
  const [catOpen, setCatOpen]         = useState(false)
  const catRef                        = useRef<HTMLDivElement>(null)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef                      = useRef<AbortController | null>(null)

  // What to display: search results when searching, all proposals when idle
  const activeCat = selected.has('All categories') || selected.size === 0
    ? '' : Array.from(selected)[0]
  const proposals = query.trim() && searchResults !== null
    ? searchResults
    : activeCat
      ? initialProposals.filter((p) => p.categoryEn === activeCat || p.category === activeCat)
      : initialProposals

  // Close category menu on outside click
  useEffect(() => {
    function close(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const doFetch = useCallback(async (q: string, cats: Set<string>) => {
    if (!q.trim()) { setSearchResults(null); setLoading(false); return }

    // Cancel any previous in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    const cat = cats.has('All categories') || cats.size === 0 ? '' : Array.from(cats)[0]
    setLoading(true)
    try {
      const params = new URLSearchParams({ lang, q: q.trim() })
      if (cat) params.set('category', cat)
      const res  = await fetch(`/api/search?${params}`, { signal })
      const data = (await res.json()) as { results?: ProposalResult[] }
      setSearchResults(data.results ?? [])
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') { /* keep last results */ }
    } finally {
      setLoading(false)
    }
  }, [lang])

  function handleSearch(q: string) {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      abortRef.current?.abort()       // cancel any in-flight fetch
      setSearchResults(null)          // back to all proposals
      setLoading(false)               // hide spinner immediately
      return
    }
    debounceRef.current = setTimeout(() => doFetch(q, selected), 300)
  }

  function toggleCat(cat: string) {
    const next = new Set(selected)
    if (cat === 'All categories') {
      next.clear(); next.add('All categories')
    } else {
      next.delete('All categories')
      next.has(cat) ? next.delete(cat) : next.add(cat)
      if (next.size === 0) next.add('All categories')
    }
    setSelected(next)
    if (query.trim()) doFetch(query, next)
    // no query → derived display auto-updates via activeCat
  }

  const summary = selected.has('All categories') || selected.size === 0
    ? 'All categories'
    : Array.from(selected).join(', ')

  const sidebar = (
    <aside className="sidebar" aria-label="Search and filter">
      <div className="combined-section">

        {/* Search */}
        <div className="search-section">
          <div className="field">
            <label className="label" htmlFor="q">Search for proposals</label>
            <input
              className="input"
              id="q"
              type="search"
              placeholder={PLACEHOLDER[lang]}
              autoComplete="off"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="categories-section">
          <div className="field">
            <label className="label">Categories (select one or more)</label>
            <select id="cat" className="input" multiple style={{ display: 'none' }} />
            <div className={`ms${catOpen ? ' open' : ''}`} ref={catRef}>
              <button
                type="button"
                id="cat-toggle"
                className="ms-toggle input"
                aria-haspopup="listbox"
                aria-expanded={catOpen}
                onClick={() => setCatOpen((o) => !o)}
              >
                <span className="ms-summary">{summary}</span>
              </button>
              <div className="ms-menu" role="listbox" aria-label="Categories">
                {initialCategories.map((cat) => {
                  const hex = localisedCategoryMap[cat]?.hex
                  return (
                    <div
                      key={cat}
                      className="ms-item"
                      role="option"
                      aria-selected={selected.has(cat)}
                      onClick={() => toggleCat(cat)}
                    >
                      <span className="ms-check">{selected.has(cat) ? '✓' : ''}</span>
                      {hex && <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex, display: 'inline-block', marginRight: 6, flexShrink: 0 }} />}
                      <span className="ms-label">{cat}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="category-legend">
          <div className="legend-content">
            <h3>Category Colors</h3>
            <div className="legend-items">
              {Object.entries(localisedCategoryMap).map(([locName, { hex }]) => (
                <div key={locName} className="legend-item">
                  <div className="legend-color" style={{ background: `linear-gradient(135deg, ${hex} 0%, ${adjustHex(hex, -30)} 100%)` }} />
                  <span>{locName}</span>
                </div>
              ))}
            </div>
            <div className="source-badge-legend">
              <div className="legend-items">
                <div className="legend-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/images/Public_badge.png" alt="Public" className="badge-icon" />
                  <span>Public Proposals</span>
                </div>
              </div>
            </div>
            <div className="feedback-section">
              <button className="feedback-btn" onClick={() => window.open('https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=vxOXUi1DA0Kr_7p5ETfbGCkugH3vJ0lLgoUGiz8aXsZUOFhIWjBXNzNDNTU0QTk4RzBPTFBCN0I3Vy4u&origin=DesignPageError', '_blank')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                </svg>
                <span>Public Feedback</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </aside>
  )

  const resultsPanel = (
    <div className="content">
      <div className="results-container">
        {loading && (
          <div className="loading-spinner" style={{ display: 'flex' }}>
            <div className="spinner">
              <div className="stream-container">
                <div className="stream-track">
                  <div className="stream-liquid">
                    <div className="wave wave-1" /><div className="wave wave-2" /><div className="wave wave-3" />
                    <div className="stream-dots">
                      {[0,1,2,3,4].map((i) => <div key={i} className="dot" />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p>Loading proposals...</p>
          </div>
        )}
        {!loading && proposals.length === 0 && (
          <div className="empty" role="status">
            No proposals match your search or filters. Try a different keyword or clear filters.
          </div>
        )}
        {!loading && proposals.length > 0 && (
          <div id="results" className="grid" aria-live="polite">
            {proposals.map((p) => <ProposalCard key={p.file_path} proposal={p} />)}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Tab navigation */}
      <div className="tab-navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button${activeTab === tab.id ? ' active' : ''}`}
            data-tab={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tab.icon} alt={tab.label} width={56} height={56} className="tab-icon" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tab-content">
        <div id="formulated-proposals" className={`tab-panel${activeTab === 'formulated-proposals' ? ' active' : ''}`}>
          <main className="main-layout">
            {sidebar}
            {resultsPanel}
          </main>
        </div>

        <div id="budget-concepts" className={`tab-panel${activeTab === 'budget-concepts' ? ' active' : ''}`}>
          <div className="disclaimer-banner">
            <div className="disclaimer-text">
              <p><strong>Disclaimer:</strong> The concepts on this page are submissions made directly by individual(s) and/or organization(s) for consideration in the national budget. The content, information, and data provided reflect the views and ideas of the respective submitter(s). They have not been independently verified, reviewed, or endorsed by Verité Research.</p>
            </div>
          </div>
          <PlaceholderPanel title="Concepts for Budget Proposals" body="This section will display budget concepts submitted by the public." />
        </div>

        <div id="other-proposals" className={`tab-panel${activeTab === 'other-proposals' ? ' active' : ''}`}>
          <PlaceholderPanel title="Budget Proposals on other sites" body="This section will display links to budget proposals submitted by other organizations." />
        </div>
      </div>
    </>
  )
}
