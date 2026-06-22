'use client'

import { useState } from 'react'

export function SiteHeader() {
  const [expanded, setExpanded] = useState(false)

  return (
    <header className="site-header">
      <div className="hero">
        <h1>THE BUDGET PROPOSAL HUB: Your Budget, Your Future</h1>
        <div className="hero-main">
          <div className="hero-content">
            <p>
              The Budget Proposal Hub is Sri Lanka&apos;s first interactive space for budget ideas, hosted on PublicFinance.lk, a platform maintained by Verité Research
            </p>
            {expanded && (
              <>
                <p>The Hub brings together two types of contributions to the national budget:</p>
                <p>
                  • <strong>Formulated Budget Proposals</strong> – comprehensive, evidence-based submissions to the Ministry of Finance. They provide clear, actionable recommendations designed to address pressing challenges and drive meaningful change
                </p>
                <p>
                  • <strong>Concepts for Budget Proposals</strong> – ideas or suggestions for the national budget that may not yet be fully developed into detailed proposals. They capture the essence of a recommendation and provide space for citizens to share their priorities and perspectives.
                </p>
                <p>
                  On the Hub, you can also download the template to draft your own proposal and show support by voting on existing ones.
                </p>
                <p>
                  Want to go further? Partner with us in drafting and sending proposals:{' '}
                  <a href="mailto:pfp@veriteresearch.org">pfp@veriteresearch.org</a>
                </p>
              </>
            )}
            <button className="read-more-btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Read Less' : 'Read More'}
            </button>
          </div>

          <div className="hero-actions">
            <a
              href="/assets/pdfs/20250908_VeritéResearch_BudgetProposalHub_Template.pdf"
              className="hero-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="btn-text">
                <span>Download</span>
                <span>Proposal</span>
                <span>Template</span>
              </div>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="download-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
