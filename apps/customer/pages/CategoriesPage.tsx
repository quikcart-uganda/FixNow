import { Link } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { categoriesApi, mapCategory } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'
import type { CustomerCategory } from '@customer/data'

export function CategoriesPage() {
  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory) as CustomerCategory[]
  }, [], { isEmpty: (items) => items.length === 0, cacheKey: 'categories.v1' })

  useRealtimeReload(() => void categoriesQuery.reload(), [SOCKET_EVENTS.CATEGORY_UPDATED])

  return (
    <div>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4 sm:px-5 lg:px-6">
        <Link to="/customer/home" className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" className="text-on-surface" />
        </Link>
        <h1 className="text-title-md text-on-surface">All Categories</h1>
      </header>

      <AsyncStateView
        status={categoriesQuery.status}
        error={categoriesQuery.error}
        onRetry={() => void categoriesQuery.reload()}
        emptyTitle="No categories yet"
        emptyHint="Service categories will appear here once they are available."
        loadingLabel="Loading categories…"
      >
        <div className="mx-auto grid w-full max-w-[100rem] grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-5 md:grid-cols-4 lg:grid-cols-6 lg:p-6 xl:grid-cols-8 2xl:grid-cols-10">
          {safeArray<CustomerCategory>(categoriesQuery.data).map((cat) => (
            <Link
              key={cat.id}
              to={`/customer/search?categoryId=${cat.id}`}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-6 shadow-sm transition hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-fixed">
                <Icon name={cat.icon} className="text-3xl text-primary" />
              </div>
              <span className="text-center text-body-sm font-semibold text-on-surface">{cat.name}</span>
            </Link>
          ))}
        </div>
      </AsyncStateView>
    </div>
  )
}
