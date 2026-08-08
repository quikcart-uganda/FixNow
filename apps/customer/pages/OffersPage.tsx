import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  categoriesApi,
  customerApi,
  mapCategory,
  offersApi,
  type TechnicianOffer,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Icon } from '@fixnow/ui'
import { CACHE_KEYS, cacheGet, cacheSet } from '@fixnow/native'
import { CustomerOfferCard } from '@customer/components/CustomerOfferCard'
import { safeArray } from '@fixnow/utils'

const FILTERS = [
  { id: 'nearby', label: 'Nearby', sort: 'newest' as const },
  { id: 'highest_discount', label: 'Highest Discount', sort: 'discount' as const },
  { id: 'newest', label: 'Newest', sort: 'newest' as const },
  { id: 'expiring_soon', label: 'Expiring Soon', sort: 'expiring' as const },
  { id: 'most_popular', label: 'Most Popular', sort: 'popular' as const },
] as const

export function OffersPage() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('filter') || 'newest'
  const categoryId = params.get('categoryId') || ''
  const navigate = useNavigate()
  const [offlineHint, setOfflineHint] = useState(false)

  const profileQuery = useAsync(async () => {
    const res = await customerApi.getProfile()
    const loc = (res.data.profile?.location as Record<string, unknown> | undefined) ?? {}
    return { district: String(loc.district ?? '') }
  }, [])

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 30 })
    return safeArray(res.data?.items).map(mapCategory)
  }, [])

  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[2]
  const district = profileQuery.data?.district

  const offersQuery = useAsync(async () => {
    try {
      const res = await offersApi.listPublic({
        district: activeFilter.id === 'nearby' && district ? district : undefined,
        categoryId: categoryId || undefined,
        sort: activeFilter.sort,
        limit: 40,
      })
      const items = safeArray<TechnicianOffer>(res.data?.items)
      void cacheSet(CACHE_KEYS.customerOffersRecent, items, 30 * 60_000)
      setOfflineHint(false)
      return items
    } catch (err) {
      const cached = await cacheGet<TechnicianOffer[]>(CACHE_KEYS.customerOffersRecent)
      if (cached?.length) {
        setOfflineHint(true)
        return cached
      }
      throw err
    }
  }, [activeFilter.id, activeFilter.sort, categoryId, district])

  const setFilter = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('filter', id)
    setParams(next)
  }

  const setCategory = (id: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set('categoryId', id)
    else next.delete('categoryId')
    setParams(next)
  }

  const categories = safeArray(categoriesQuery.data)
  const title = useMemo(() => {
    if (categoryId) {
      const cat = categories.find((c) => c.id === categoryId)
      return cat ? `${cat.name} offers` : 'Offers'
    }
    return 'Today’s Offers'
  }, [categoryId, categories])

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="tap-target -ml-2">
          <Icon name="arrow_back" className="text-on-surface" />
        </button>
        <h1 className="text-title-md text-on-surface">{title}</h1>
        <Link to="/customer/offers/saved" className="ml-auto tap-target text-primary" aria-label="Saved offers">
          <Icon name="favorite" />
        </Link>
      </header>

      <div className="space-y-4 px-4 py-4">
        {offlineHint ? (
          <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface-variant">
            Showing cached offers — you’re offline or the network is slow.
          </p>
        ) : null}

        <div className="no-scrollbar scroll-touch-x flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
              !categoryId ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-canvas-white'
            }`}
          >
            All categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                categoryId === cat.id ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-canvas-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="no-scrollbar scroll-touch-x flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                filter === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border-subtle bg-canvas-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <AsyncStateView
          status={offersQuery.status}
          error={offersQuery.error}
          onRetry={() => void offersQuery.reload()}
          emptyTitle="No offers right now"
          emptyHint="Check back soon — technicians publish promotions after they are reviewed."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {safeArray<TechnicianOffer>(offersQuery.data).map((offer) => (
              <CustomerOfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        </AsyncStateView>
      </div>
    </div>
  )
}
