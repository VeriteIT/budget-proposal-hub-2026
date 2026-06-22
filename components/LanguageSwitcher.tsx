'use client'

import { useRouter } from 'next/navigation'
import type { Lang } from '@/types'

const LABEL: Record<Lang, string> = { en: 'EN', si: 'සිං', ta: 'தமி' }
const LANGS: Lang[] = ['en', 'si', 'ta']

export function LanguageSwitcher({ current }: { current: Lang }) {
  const router = useRouter()

  return (
    <div className="lang-switcher" role="group" aria-label="Language selection">
      {LANGS.map((lang) => (
        <button
          key={lang}
          className={`lang-btn${current === lang ? ' active' : ''}`}
          onClick={() => router.push(`/${lang}`)}
          type="button"
          aria-pressed={current === lang}
        >
          {LABEL[lang]}
        </button>
      ))}
    </div>
  )
}
