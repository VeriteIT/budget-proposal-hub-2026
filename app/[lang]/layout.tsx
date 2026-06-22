import { notFound } from 'next/navigation'
import { SUPPORTED_LANGS, type Lang } from '@/types'
import { ChatWidget } from '@/components/ChatWidget'

interface Props {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}

export function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }))
}

export default async function LangLayout({ children, params }: Props) {
  const { lang } = await params
  if (!SUPPORTED_LANGS.includes(lang as Lang)) notFound()

  return (
    <>
      {children}
      <ChatWidget lang={lang as Lang} />
    </>
  )
}
