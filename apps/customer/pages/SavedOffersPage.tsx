import { Link, useNavigate } from 'react-router-dom'
import { offersApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Icon } from '@fixnow/ui'
import { CustomerOfferCard } from '@customer/components/CustomerOfferCard'
import { safeArray } from '@fixnow/utils'

export function SavedOffersPage() {
  const navigate = useNavigate()
  const query = useAsync(async () => safeArray((await offersApi.listSaved({ limit: 50 })).data?.items), [])

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="tap-target -ml-2">
          <Icon name="arrow_back" />
        </button>
        <h1 className="text-title-md text-on-surface">Saved offers</h1>
        <Link to="/customer/offers" className="ml-auto text-label-caps text-primary">
          BROWSE
        </Link>
      </header>

      <div className="px-4 py-4">
        <AsyncStateView
          status={query.status}
          error={query.error}
          onRetry={() => void query.reload()}
          emptyTitle="No saved offers"
          emptyHint="Tap the heart on any promotion to save it here and get expiry reminders."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {safeArray(query.data).map((offer) => (
              <CustomerOfferCard
                key={offer.id}
                offer={offer}
                onSavedChange={() => void query.reload()}
              />
            ))}
          </div>
        </AsyncStateView>
      </div>
    </div>
  )
}
