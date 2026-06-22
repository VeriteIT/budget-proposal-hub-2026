'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Lang } from '@/types'

const LANGS = [
  { value: 'en' as Lang, label: 'English' },
  { value: 'si' as Lang, label: 'සිංහල' },
  { value: 'ta' as Lang, label: 'தமிழ்' },
]

const TITLE_OPTIONS = [
  { value: '', label: 'The Budget Proposal Hub' },
  { value: 'https://dashboards.publicfinance.lk/infrastructure-watch/', label: 'INFRASTRUCTURE WATCH' },
  { value: 'https://dashboards.publicfinance.lk/fuel-price-tracker/', label: 'FUEL PRICE TRACKER' },
  { value: 'https://dashboards.publicfinance.lk/budget-promises/', label: 'BUDGET PROMISES' },
  { value: 'https://dashboards.publicfinance.lk/fiscal-indicator/', label: 'FISCAL INDICATORS' },
]

export function Navbar({ lang }: { lang: Lang }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()

  function handleLang(value: string) {
    router.push(`/${value}`)
  }

  function handleTitle(value: string) {
    if (value) window.open(value, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="pf-topbar">
      <div className="pf-topbar__inner">

        {/* Brand */}
        <a href="https://publicfinance.lk/" className="pf-brand" target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/publicfinance-logo.png" alt="PublicFinance.lk" className="pf-brand__img" />
        </a>

        {/* Title dropdown */}
        <div className="pf-header-content">
          <div className="pf-title-dropdown">
            <select className="pf-title-select" onChange={(e) => handleTitle(e.target.value)} defaultValue="">
              {TITLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <svg className="dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
        </div>

        {/* Language select */}
        <div className="pf-actions">
          <div className="language-dropdown">
            <select className="language-select" value={lang} onChange={(e) => handleLang(e.target.value)}>
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile toggle */}
        <button
          className={`mobile-menu-toggle${mobileOpen ? ' active' : ''}`}
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>

        {/* Overlay */}
        <div
          className={`mobile-menu-overlay${mobileOpen ? ' active' : ''}`}
          onClick={() => setMobileOpen(false)}
        />

        {/* Mobile menu */}
        <div className={`mobile-menu${mobileOpen ? ' active' : ''}`}>
          <div className="mobile-menu-content">
            <div className="mobile-title-dropdown">
              <select className="mobile-title-select" onChange={(e) => handleTitle(e.target.value)} defaultValue="">
                {TITLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="mobile-language-dropdown">
              <select className="mobile-language-select" value={lang} onChange={(e) => handleLang(e.target.value)}>
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="mobile-feedback-section">
              <button className="feedback-btn" onClick={() => window.open('https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=vxOXUi1DA0Kr_7p5ETfbGCkugH3vJ0lLgoUGiz8aXsZUOFhIWjBXNzNDNTU0QTk4RzBPTFBCN0I3Vy4u&origin=DesignPageError', '_blank')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                </svg>
                <span>Send in your feedback</span>
              </button>
            </div>
            <div className="mobile-category-legend">
              <div className="legend-content">
                <h3>Category Colors</h3>
                <div className="legend-items">
                  <div className="legend-item"><div className="legend-color category-blue" /><span>Economic Growth</span></div>
                  <div className="legend-item"><div className="legend-color category-yellow" /><span>Justice and Rights</span></div>
                  <div className="legend-item"><div className="legend-color category-red" /><span>Governance</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
