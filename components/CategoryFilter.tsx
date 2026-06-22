'use client'

import { useState, useRef, useEffect } from 'react'

const CATEGORY_COLOR: Record<string, string> = {
  'All categories': '#288e76',
  Healthcare:       '#ef4444',
  Education:        '#3b82f6',
  Infrastructure:   '#eab308',
  Agriculture:      '#22c55e',
  Environment:      '#14b8a6',
  Technology:       '#8b5cf6',
  Other:            '#94a3b8',
}

interface Props {
  categories: string[]
  selected: string
  onChange: (category: string) => void
}

export function CategoryFilter({ categories, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const dotColor = CATEGORY_COLOR[selected] ?? '#94a3b8'

  return (
    <div className="cat-filter" ref={ref}>
      <button
        className="cat-toggle"
        onClick={() => setOpen((o) => !o)}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cat-dot" style={{ background: dotColor }} />
        <span>{selected || 'All categories'}</span>
        <svg className={`cat-caret${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="cat-menu" role="listbox">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-item${selected === cat ? ' active' : ''}`}
              role="option"
              aria-selected={selected === cat}
              onClick={() => { onChange(cat); setOpen(false) }}
              type="button"
            >
              <span className="cat-dot" style={{ background: CATEGORY_COLOR[cat] ?? '#94a3b8' }} />
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
