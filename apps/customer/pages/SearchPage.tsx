import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon, ProfileAvatar, LazyImage, SubscriptionBadge } from '@fixnow/ui'
import { mapCustomerTechnicianCard, technicianApi } from '@fixnow/api'
import { useAsync, useDebouncedValue } from '@fixnow/hooks'
import { AsyncStateView, useOptionalLocationPermission } from '@fixnow/shared'
import { DATA_CACHE_KEYS } from '@fixnow/native'
import { safeArray } from '@fixnow/utils'
import type { CustomerTechnician } from '@customer/data'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const locationPermission = useOptionalLocationPermission()
  const initialQuery = searchParams.get('q') ?? ''
  const categoryId = searchParams.get('categoryId') ?? undefined
  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebouncedValue(query, 300)
  const promptedRef = useRef(false)

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  useEffect(() => {
    const params: Record<string, string> = {}
    if (debouncedQuery.trim()) params.q = debouncedQuery.trim()
    if (categoryId) params.categoryId = categoryId
    const currentQ = searchParams.get('q') ?? ''
    const currentCat = searchParams.get('categoryId') ?? undefined
    if (currentQ === (params.q ?? '') && currentCat === categoryId) return
    setSearchParams(params, { replace: true })
  }, [debouncedQuery, categoryId, searchParams, setSearchParams])

  useEffect(() => {
    if (!locationPermission || promptedRef.current) return
    if (!debouncedQuery.trim() && !categoryId) return
    promptedRef.current = true
    void locationPermission.ensureLocation('search')
  }, [categoryId, debouncedQuery, locationPermission])

  const searchQuery = useAsync(
    async () => {
      const coords = locationPermission?.lastCoords
      const res = await technicianApi.search({
        q: debouncedQuery.trim() || undefined,
        categoryId,
        limit: 30,
        sort: '-trustScore',
        lat: coords?.latitude,
        lng: coords?.longitude,
      })
      return safeArray(res.data?.items).map(mapCustomerTechnicianCard) as CustomerTechnician[]
    },
    [debouncedQuery, categoryId, locationPermission?.lastCoords?.latitude, locationPermission?.lastCoords?.longitude],
    {
      isEmpty: (items) => items.length === 0,
      cacheKey: `${DATA_CACHE_KEYS.categories}:search:${categoryId ?? 'all'}:${debouncedQuery.trim().toLowerCase()}`,
      cacheFreshMs: 60_000,
    },
  )

  return (
    <div className="">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-canvas-white px-4 py-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <Icon name="search" className="text-outline" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search technicians, trades..."
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full rounded-full border border-border-subtle bg-surface-container-low pl-12 pr-4 text-body-lg outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[100rem] space-y-3 p-4 sm:p-5 lg:p-6">
        <p className="text-label-caps uppercase text-on-surface-variant">
          {searchQuery.status === 'success'
            ? `${searchQuery.data?.length ?? 0} technicians near you`
            : 'Search technicians'}
        </p>

        <AsyncStateView
          status={searchQuery.status}
          error={searchQuery.error}
          onRetry={() => void searchQuery.reload()}
          emptyTitle="No technicians found"
          emptyHint={
            debouncedQuery.trim()
              ? 'Try a different search term or browse all categories.'
              : 'No verified technicians are available in your area yet.'
          }
          loadingLabel="Searching technicians…"
          fromCache={searchQuery.fromCache}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {safeArray<CustomerTechnician>(searchQuery.data).map((tech) => (
              <Link
                key={tech.id}
                to={`/customer/technician/${tech.id}`}
                className="flex gap-4 rounded-xl border border-border-subtle bg-canvas-white p-4 shadow-sm transition hover:border-primary/25"
              >
                <ProfileAvatar
                  alt={tech.name}
                  src={tech.photo}
                  className="h-16 w-16 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-body-lg font-bold text-on-surface">{tech.name}</p>
                    {tech.subscriptionBadge ? (
                      <SubscriptionBadge
                        text={tech.subscriptionBadge.text}
                        icon={tech.subscriptionBadge.icon}
                        color={tech.subscriptionBadge.color}
                        borderColor={tech.subscriptionBadge.borderColor}
                        glow={tech.subscriptionBadge.glow}
                        size={tech.subscriptionBadge.size || 'sm'}
                        boostActive={tech.boostActive}
                      />
                    ) : tech.boostActive ? (
                      <SubscriptionBadge boostActive />
                    ) : null}
                  </div>
                  <p className="text-body-sm text-on-surface-variant">{tech.trade}</p>
                  <p className="mt-1 text-label text-outline">
                    ★ {tech.rating} · {tech.jobs} jobs · Trust {tech.trustScore}
                    {tech.etaLabel ? ` · ETA ${tech.etaLabel}` : ''}
                    {tech.distanceKm != null ? ` · ${tech.distanceKm} km` : ''}
                  </p>
                  {tech.indicators?.length ? (
                    <p className="mt-1 truncate text-[11px] text-on-surface-variant">
                      {tech.indicators
                        .slice(0, 3)
                        .map((id) =>
                          id === 'available_now'
                            ? 'Available Now'
                            : id === 'responds_quickly'
                              ? 'Responds Quickly'
                              : id === 'top_rated'
                                ? 'Top Rated'
                                : id === 'verified'
                                  ? 'Verified'
                                  : id === 'professional' || id === 'business' || id === 'starter'
                                    ? ''
                                    : id.replace(/_/g, ' '),
                        )
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </AsyncStateView>
      </div>
    </div>
  )
}
