'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  onSearch: (query: string) => void
  placeholder?: string
}

export function SearchBar({ onSearch, placeholder = 'Search proposals…' }: Props) {
  const [value, setValue] = useState('')
  const callbackRef = useRef(onSearch)
  useEffect(() => { callbackRef.current = onSearch }, [onSearch])

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(value), 150)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="search-wrapper">
      <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#96A0AB" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search proposals"
      />
    </div>
  )
}
