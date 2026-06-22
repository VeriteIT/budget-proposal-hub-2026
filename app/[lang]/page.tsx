import type { Lang } from '@/types'
import { getAllProposals, loadMetadata, getField } from '@/lib/metadata'
import { loadCategories, resolveCategoryHex } from '@/lib/categories'
import { Navbar } from '@/components/Navbar'
import { SiteHeader } from '@/components/SiteHeader'
import { ProposalsClient } from '@/components/ProposalsClient'
import { Footer } from '@/components/Footer'

export const revalidate = 3600

interface Props {
  params: Promise<{ lang: Lang }>
}

export default async function ProposalsPage({ params }: Props) {
  const { lang } = await params
  const proposals = await getAllProposals(lang)
  const categoryMap = await loadCategories()

  const metadata = await loadMetadata()

  // Build localised category map: localisedName → { hex, enName }
  // Only includes categories actually used by at least one proposal.
  // The dropdown and legend both key off localised names.
  const localisedCategoryMap: Record<string, { hex: string; enName: string }> = {}
  for (const entry of Object.values(metadata)) {
    const enName  = getField(entry, 'category', 'en')
    const siName  = getField(entry, 'category', 'si')
    const taName  = getField(entry, 'category', 'ta')
    const locName = getField(entry, 'category', lang)
    if (!locName) continue
    if (localisedCategoryMap[locName]) continue  // already added

    const hex = resolveCategoryHex(categoryMap, { en: enName, si: siName, ta: taName })
    if (!hex) continue  // no colour defined — skip

    localisedCategoryMap[locName] = { hex, enName }
  }

  // Sorted localised names for the filter dropdown (mirrors initialCategories order)
  const categories = ['All categories', ...Object.keys(localisedCategoryMap).sort()]

  return (
    <>
      <Navbar lang={lang} />
      <SiteHeader />
      <ProposalsClient
        lang={lang}
        initialProposals={proposals}
        initialCategories={categories}
        localisedCategoryMap={localisedCategoryMap}
      />
      <Footer />
    </>
  )
}
