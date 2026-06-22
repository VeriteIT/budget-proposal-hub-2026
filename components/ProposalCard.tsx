import type { ProposalResult } from '@/types'

function costInfo(costText: string): { show: boolean; cls: string; text: string } {
  const t = (costText ?? '').trim()
  if (!t || /^no\s+costing\s+available$/i.test(t) || t === '—') return { show: false, cls: '', text: '' }
  if (/^cost\s*=/i.test(t))    return { show: true, cls: 'badge--red',   text: t }
  if (/^revenue\s*=/i.test(t)) return { show: true, cls: 'badge--green', text: t }
  if (/^LKR\s+\d+/.test(t))   return { show: true, cls: 'badge--red',   text: `Cost = ${t}` }
  return { show: true, cls: 'badge--red', text: t }
}

interface Props {
  proposal: ProposalResult
}

export function ProposalCard({ proposal }: Props) {
  const { show: showCost, cls: costCls, text: costText } = costInfo(proposal.costLKR)
  const letter = (proposal.category || '•').trim().charAt(0).toUpperCase()

  const hex = proposal.categoryHex
  const headerStyle = hex
    ? { background: `linear-gradient(135deg, ${hex} 0%, ${adjustHex(hex, -30)} 100%)` }
    : {}
  const headerClass = 'card-header'

  return (
    <article className="card" aria-label={proposal.title}>
      <div className="card-inner">

        <div className={headerClass} style={headerStyle}>
          <div className="thumbnail-section">
            <div className="thumb-wrap">
              {proposal.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="thumb" src={`/${proposal.thumbUrl}`} alt="" />
              ) : (
                <div className="thumb-fallback" aria-hidden="true">{letter}</div>
              )}
            </div>
          </div>
          <div className="title-section">
            <h3 className="card-title">{proposal.title}</h3>
            <div className="vote-section" />
          </div>
        </div>

        <div className="card-body">
          <div className="summary">
            <span className="summary-full">{proposal.summary}</span>
          </div>
          <div className="meta" />
          <div className="actions">
            {proposal.badge === 'Public' && (
              <span className="source-badge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/images/Public_badge.png" alt="Public" />
              </span>
            )}
            {showCost && (
              <span className={`badge ${costCls}`} title="Estimated cost">{costText}</span>
            )}
            {proposal.pdfUrl && (
              <a className="download" href={`/${proposal.pdfUrl}`} target="_blank" rel="noopener noreferrer">
                Download the analysis
              </a>
            )}
          </div>
        </div>

      </div>
    </article>
  )
}

// Darken a hex color by `amount` (0–255) for gradient end
function adjustHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, (n >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
