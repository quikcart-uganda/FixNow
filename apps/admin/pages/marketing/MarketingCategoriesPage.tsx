import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'

/** Marketing entry for service categories — reuses the marketplace Categories admin page. */
export function MarketingCategoriesPage() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-canvas-white p-6">
      <h3 className="text-lg font-semibold text-ink-primary">Marketing categories</h3>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        Technician offers and platform promotions target marketplace service categories. Manage the shared category
        taxonomy from the Categories admin module — changes apply to offer targeting and customer discovery.
      </p>
      <div className="mt-4">
        <Link to="/admin/categories">
          <Button>Open Categories</Button>
        </Link>
      </div>
    </div>
  )
}
