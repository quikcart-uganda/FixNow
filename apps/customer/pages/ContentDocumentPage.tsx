import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { CmsDocumentView } from '@fixnow/shared'
import type { PublicContentPage } from '@fixnow/api'

async function sharePage(page: PublicContentPage) {
  const url = `${window.location.origin}/customer/content/${page.slug}`
  try {
    if (navigator.share) {
      await navigator.share({ title: page.title, text: page.excerpt || page.title, url })
      return
    }
  } catch {
    /* user cancelled */
  }
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    /* ignore */
  }
}

export function ContentDocumentPage() {
  const { slug = 'help' } = useParams()
  const [params] = useSearchParams()
  const language = params.get('lang') || 'en'

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to="/customer/help" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-title-md capitalize">{slug.replace(/-/g, ' ')}</h1>
      </header>
      <section className="p-4">
        <CmsDocumentView
          slug={slug}
          audience="customer"
          language={language}
          onShare={(page) => void sharePage(page)}
        />
      </section>
    </div>
  )
}
