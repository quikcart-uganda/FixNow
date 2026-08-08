import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { CmsDocumentView } from '@fixnow/shared'
import type { PublicContentPage } from '@fixnow/api'

async function sharePage(page: PublicContentPage) {
  const url = `${window.location.origin}/technician/content/${page.slug}`
  try {
    if (navigator.share) {
      await navigator.share({ title: page.title, text: page.excerpt || page.title, url })
      return
    }
  } catch {
    /* cancelled */
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
    <div className="space-y-4 p-4 md:p-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <Link to="/technician/help" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" />
        </Link>
        <h1 className="text-headline capitalize">{slug.replace(/-/g, ' ')}</h1>
      </div>
      <CmsDocumentView
        slug={slug}
        audience="technician"
        language={language}
        onShare={(page) => void sharePage(page)}
      />
    </div>
  )
}
