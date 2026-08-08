import { useState } from 'react'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView, FormError } from '@fixnow/shared'
import {
  ApiError,
  getFriendlyErrorMessage,
  seedPlatformApi,
  type SeedPlatformOverview,
} from '@fixnow/api/admin'
import { Button, Icon, PageHeader, StatusBadge, Surface } from '../components/ui'

const MODULE_ACTIONS: Array<{ key: string; label: string; modules: string[] }> = [
  { key: 'customers', label: 'Generate Customers', modules: ['customers'] },
  { key: 'technicians', label: 'Generate Technicians', modules: ['technicians', 'companies'] },
  { key: 'jobs', label: 'Generate Jobs', modules: ['jobs'] },
  { key: 'reviews', label: 'Generate Reviews', modules: ['reviews'] },
  { key: 'offers', label: 'Generate Offers', modules: ['offers'] },
  { key: 'portfolios', label: 'Generate Portfolios', modules: ['portfolios'] },
  { key: 'advertisements', label: 'Generate Advertisements', modules: ['advertisements'] },
  { key: 'ai', label: 'Generate AI Conversations', modules: ['ai'] },
]

type SeedTechRow = {
  userId: string
  seedKey: string
  email: string
  fullName: string
  companyName: string
  accountStatus: string
  isAvailableNow: boolean
  hiddenFromCustomers: boolean
  inActiveCatalogue: boolean
  permanentDeveloper: boolean
  lifecycle: string
  planCode?: string | null
}

type SeedCustomerRow = {
  userId: string
  seedKey: string
  email: string
  fullName: string
  accountStatus: string
  inActiveCatalogue: boolean
  permanentDeveloperCustomer: boolean
  scenarioPermissions: boolean
  jobsPosted: number
  jobsCompleted: number
  lifecycle: string
}

function SeedCustomersPanel({
  actionBusy,
  onBusy,
  onMessage,
  onError,
}: {
  actionBusy: string | null
  onBusy: (key: string | null) => void
  onMessage: (msg: string | null) => void
  onError: (msg: string | null) => void
}) {
  const list = useAsync(async () => (await seedPlatformApi.listSeedCustomers()).data, [])

  const runLifecycle = async (
    key: string,
    body: { userId: string; action: 'suspend' | 'activate' },
    ok: string,
  ) => {
    onBusy(key)
    onError(null)
    onMessage(null)
    try {
      await seedPlatformApi.setSeedCustomerLifecycle(body)
      onMessage(ok)
      list.reload()
    } catch (err) {
      onError(getFriendlyErrorMessage(err))
    } finally {
      onBusy(null)
    }
  }

  return (
    <Surface className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Seed customers</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Permanent Seed Customer plus catalogue fixtures. Suspend does not delete history or change
            passwords.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={Boolean(actionBusy)} onClick={() => void list.reload()}>
          Refresh
        </Button>
      </div>

      <AsyncStateView status={list.status} error={list.error} onRetry={list.reload}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs text-on-surface-variant">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="py-2 pr-3 font-semibold">Customer</th>
                <th className="py-2 pr-3 font-semibold">Lifecycle</th>
                <th className="py-2 pr-3 font-semibold">Jobs</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items as SeedCustomerRow[] | undefined)?.map((row) => (
                <tr key={row.userId} className="border-b border-outline-variant/50 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-on-surface">{row.fullName || row.email}</p>
                    <p className="font-mono">{row.email}</p>
                    <p>
                      {row.seedKey || '—'}
                      {row.permanentDeveloperCustomer ? ' · permanent' : ''}
                      {row.scenarioPermissions ? ' · scenarios' : ''}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBadge tone={row.lifecycle === 'suspended' ? 'warning' : 'success'}>
                      {row.lifecycle}
                    </StatusBadge>
                    <p className="mt-1">{row.accountStatus}</p>
                  </td>
                  <td className="py-2 pr-3">
                    posted {row.jobsPosted} · completed {row.jobsCompleted}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(actionBusy)}
                        onClick={() =>
                          void runLifecycle(
                            `${row.userId}-activate`,
                            { userId: row.userId, action: 'activate' },
                            `${row.email}: Activate`,
                          )
                        }
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(actionBusy)}
                        onClick={() =>
                          void runLifecycle(
                            `${row.userId}-suspend`,
                            { userId: row.userId, action: 'suspend' },
                            `${row.email}: Suspend`,
                          )
                        }
                      >
                        Suspend
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncStateView>
    </Surface>
  )
}

function SeedScenariosPanel({
  actionBusy,
  onBusy,
  onMessage,
  onError,
}: {
  actionBusy: string | null
  onBusy: (key: string | null) => void
  onMessage: (msg: string | null) => void
  onError: (msg: string | null) => void
}) {
  const list = useAsync(async () => (await seedPlatformApi.listSeedScenarios()).data, [])
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const generate = async (all: boolean) => {
    onBusy(all ? 'scenarios-all' : 'scenarios-selected')
    onError(null)
    onMessage(null)
    try {
      const res = await seedPlatformApi.generateSeedScenarios(
        all ? { all: true } : { scenarioIds: selected },
      )
      const n = res.data?.created?.length ?? 0
      onMessage(
        `Created ${n} scenario job(s) via production pipeline for ${res.data?.customerEmail || 'Seed Customer'}.`,
      )
    } catch (err) {
      onError(getFriendlyErrorMessage(err))
    } finally {
      onBusy(null)
    }
  }

  return (
    <Surface className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-on-surface">Seed scenarios</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Generate realistic jobs as the Permanent Seed Customer through{' '}
          <code>jobMarketplaceService.create</code> (matching → applications → chat → completion → review).
          Blocked in Platform Mode Production.
        </p>
        {list.data?.customerEmail ? (
          <p className="mt-1 text-xs text-on-surface-variant">Actor: {list.data.customerEmail}</p>
        ) : null}
      </div>

      <AsyncStateView status={list.status} error={list.error} onRetry={list.reload}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(list.data?.scenarios || []).map((s) => {
            const on = selected.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                  on
                    ? 'border-primary bg-primary/10 text-on-surface'
                    : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                <p className="font-semibold text-on-surface">{s.label}</p>
                <p className="mt-0.5">{s.description}</p>
                <p className="mt-1 opacity-80">
                  {s.categoryName} · {s.urgency}
                </p>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={Boolean(actionBusy) || selected.length === 0}
            onClick={() => void generate(false)}
          >
            Generate selected ({selected.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(actionBusy)}
            onClick={() => void generate(true)}
          >
            Generate all scenarios
          </Button>
          <Button size="sm" variant="secondary" disabled={Boolean(actionBusy)} onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      </AsyncStateView>
    </Surface>
  )
}

function SeedTechniciansPanel({
  actionBusy,
  onBusy,
  onMessage,
  onError,
}: {
  actionBusy: string | null
  onBusy: (key: string | null) => void
  onMessage: (msg: string | null) => void
  onError: (msg: string | null) => void
}) {
  const list = useAsync(async () => (await seedPlatformApi.listSeedTechnicians()).data, [])

  const runLifecycle = async (
    key: string,
    body: { userId: string; action: 'suspend' | 'activate' | 'hide' | 'show' | 'available' | 'unavailable' },
    ok: string,
  ) => {
    onBusy(key)
    onError(null)
    onMessage(null)
    try {
      await seedPlatformApi.setSeedTechnicianLifecycle(body)
      onMessage(ok)
      list.reload()
    } catch (err) {
      onError(getFriendlyErrorMessage(err))
    } finally {
      onBusy(null)
    }
  }

  return (
    <Surface className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Seed technicians</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Active catalogue: Permanent Development Technician + Seed Technician A (plumbing) + Seed Technician B
            (solar). Suspend hides them from customer discovery without deleting history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(actionBusy)}
            onClick={() => void list.reload()}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(actionBusy)}
            onClick={() => {
              onBusy('prune-techs')
              onError(null)
              void seedPlatformApi
                .pruneObsoleteSeedTechnicians()
                .then((res) => {
                  onMessage(`Pruned ${res.data?.pruned ?? 0} obsolete seed technicians.`)
                  list.reload()
                })
                .catch((err) => onError(getFriendlyErrorMessage(err)))
                .finally(() => onBusy(null))
            }}
          >
            Prune obsolete
          </Button>
        </div>
      </div>

      <AsyncStateView status={list.status} error={list.error} onRetry={list.reload}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs text-on-surface-variant">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="py-2 pr-3 font-semibold">Technician</th>
                <th className="py-2 pr-3 font-semibold">Lifecycle</th>
                <th className="py-2 pr-3 font-semibold">Catalogue</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items as SeedTechRow[] | undefined)?.map((row) => (
                <tr key={row.userId} className="border-b border-outline-variant/50 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-on-surface">{row.fullName || row.email}</p>
                    <p className="font-mono">{row.email}</p>
                    <p>
                      {row.seedKey || '—'}
                      {row.permanentDeveloper ? ' · permanent' : ''}
                      {row.planCode ? ` · ${row.planCode}` : ''}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBadge
                      tone={
                        row.lifecycle === 'suspended' || row.lifecycle === 'hidden'
                          ? 'warning'
                          : row.lifecycle === 'available'
                            ? 'success'
                            : 'info'
                      }
                    >
                      {row.lifecycle}
                    </StatusBadge>
                    <p className="mt-1">
                      {row.accountStatus}
                      {row.hiddenFromCustomers ? ' · hidden' : ''}
                      {row.isAvailableNow ? ' · online' : ' · offline'}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    {row.inActiveCatalogue ? 'Active catalogue' : 'Obsolete (prune)'}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          ['activate', 'Activate'],
                          ['suspend', 'Suspend'],
                          ['show', 'Visible'],
                          ['hide', 'Hide'],
                          ['available', 'Available'],
                          ['unavailable', 'Unavailable'],
                        ] as const
                      ).map(([action, label]) => (
                        <Button
                          key={action}
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(actionBusy)}
                          onClick={() =>
                            void runLifecycle(
                              `${row.userId}-${action}`,
                              { userId: row.userId, action },
                              `${row.email}: ${label}`,
                            )
                          }
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncStateView>
    </Surface>
  )
}

export function SeedPlatformPage() {
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const overview = useAsync(async () => {
    try {
      const res = await seedPlatformApi.overview()
      setForbidden(false)
      return res.data as SeedPlatformOverview
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        setForbidden(true)
      }
      throw err
    }
  }, [])

  const run = async (key: string, fn: () => Promise<unknown>, okMessage: string) => {
    setActionBusy(key)
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(okMessage)
      overview.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  const exportSeeds = async () => {
    setActionBusy('export')
    try {
      const res = await seedPlatformApi.exportData()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fixnow-seed-platform-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Seed export downloaded.')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <PageHeader title="Seed Platform" subtitle="Super Admin only" />
        <Surface className="p-6">
          <p className="text-on-surface-variant">You do not have permission to manage the Seed Platform.</p>
        </Surface>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Seed Platform"
        subtitle="Permanent sandbox fixtures for development and QA — isolated from production content."
      />

      <AsyncStateView status={overview.status} error={overview.error} onRetry={overview.reload}>
        {overview.data ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold text-on-surface">Developer technician</p>
                <StatusBadge
                  tone={
                    overview.data.developerTechnician.exists
                      ? overview.data.developerTechnician.seedAligned === false
                        ? 'warning'
                        : 'success'
                      : 'warning'
                  }
                >
                  {!overview.data.developerTechnician.exists
                    ? 'Not generated'
                    : overview.data.developerTechnician.seedAligned === false
                      ? 'Exists — not seed-aligned'
                      : 'Ready'}
                </StatusBadge>
                <p className="text-sm text-on-surface">{overview.data.developerTechnician.email}</p>
                {overview.data.developerTechnician.fullName ? (
                  <p className="text-xs text-on-surface-variant">
                    Name: {overview.data.developerTechnician.fullName}
                  </p>
                ) : null}
                <p className="text-xs text-on-surface-variant">
                  Login: {overview.data.developerTechnician.passwordHint} · account env:{' '}
                  {overview.data.developerTechnician.dataEnvironment || 'unknown'} · seed env:{' '}
                  {overview.data.environment}
                </p>
                {overview.data.developerTechnician.credentialNote ? (
                  <p className="text-xs text-on-surface-variant">
                    {overview.data.developerTechnician.credentialNote}
                  </p>
                ) : null}
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold text-on-surface">Permanent Seed Customer</p>
                <StatusBadge
                  tone={
                    overview.data.developerCustomer?.exists
                      ? overview.data.developerCustomer.seedAligned === false
                        ? 'warning'
                        : 'success'
                      : 'warning'
                  }
                >
                  {!overview.data.developerCustomer?.exists
                    ? 'Not provisioned'
                    : overview.data.developerCustomer.seedAligned === false
                      ? 'Exists — not seed-aligned'
                      : 'Ready'}
                </StatusBadge>
                <p className="text-sm text-on-surface">
                  {overview.data.developerCustomer?.email || 'kingjordannyago@gmail.com'}
                </p>
                {overview.data.developerCustomer?.fullName ? (
                  <p className="text-xs text-on-surface-variant">
                    Name: {overview.data.developerCustomer.fullName}
                  </p>
                ) : null}
                <p className="text-xs text-on-surface-variant">
                  Login: {overview.data.developerCustomer?.passwordHint || 'Original registration password'}{' '}
                  · env: {overview.data.developerCustomer?.dataEnvironment || 'unknown'}
                </p>
                {overview.data.developerCustomer?.credentialNote ? (
                  <p className="text-xs text-on-surface-variant">
                    {overview.data.developerCustomer.credentialNote}
                  </p>
                ) : null}
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold text-on-surface">Sandbox gate</p>
                <StatusBadge tone={overview.data.sandboxEnabled ? 'success' : 'warning'}>
                  {overview.data.sandboxEnabled ? 'Enabled' : 'Disabled'}
                </StatusBadge>
                <p className="text-xs text-on-surface-variant">
                  Seed actions require Sandbox Management to be enabled. Content stays in{' '}
                  <code>dataEnvironment=sandbox</code>.
                </p>
                {overview.data.sandboxPayments?.developmentTransactions ? (
                  <p className="text-xs text-on-surface-variant">
                    {overview.data.sandboxPayments.developmentTransactions}
                  </p>
                ) : null}
              </Surface>
              <Surface className="space-y-2 p-4">
                <p className="text-sm font-semibold text-on-surface">Version</p>
                <p className="text-sm text-on-surface">{overview.data.version}</p>
                <p className="text-xs text-on-surface-variant">Tag: {overview.data.seedTag}</p>
              </Surface>
            </div>

            <Surface className="p-4">
              <p className="mb-3 text-sm font-semibold text-on-surface">Counts</p>
              <dl className="grid grid-cols-2 gap-2 text-sm text-on-surface-variant md:grid-cols-5">
                {Object.entries(overview.data.counts || {}).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v}
                  </div>
                ))}
              </dl>
            </Surface>

            <Surface className="space-y-3 p-5">
              <h2 className="text-lg font-semibold text-on-surface">Lifecycle</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run(
                      'provision-dev-tech',
                      () => seedPlatformApi.provisionPermanentDevelopmentTechnician(),
                      'Permanent Development Technician provisioned (password preserved).',
                    )
                  }
                >
                  Provision Permanent Development Technician
                </Button>
                <Button
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run(
                      'provision-dev-customer',
                      () => seedPlatformApi.provisionPermanentDevelopmentCustomer(),
                      'Permanent Seed Customer provisioned (password preserved, no duplicate).',
                    )
                  }
                >
                  Provision Permanent Seed Customer
                </Button>
                <Button
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run('all', () => seedPlatformApi.generateAll(), 'Generate All complete.')
                  }
                >
                  Generate All
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void run('reset', () => seedPlatformApi.reset(), 'Seeds reset.')}
                >
                  Reset Seeds
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run('validate', () => seedPlatformApi.validate(), 'Validation finished — check response.')
                  }
                >
                  Validate Seeds
                </Button>
                <Button variant="secondary" disabled={Boolean(actionBusy)} onClick={() => void exportSeeds()}>
                  Export Seeds
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run('import', () => seedPlatformApi.importData({}), 'Import applied catalogue regenerate.')
                  }
                >
                  Import Seeds
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void run('archive', () => seedPlatformApi.archive(), 'Seeds archived.')}
                >
                  Archive Seeds
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void run('delete', () => seedPlatformApi.deleteSeeds(), 'Seeds deleted.')}
                >
                  Delete Seeds
                </Button>
              </div>
            </Surface>

            {overview.data.developmentTransactions &&
            typeof overview.data.developmentTransactions === 'object' &&
            Array.isArray((overview.data.developmentTransactions as { items?: unknown[] }).items) ? (
              <Surface className="space-y-3 p-5">
                <h2 className="text-lg font-semibold text-on-surface">Development Transaction IDs</h2>
                <p className="text-xs text-on-surface-variant">
                  {(overview.data.developmentTransactions as { note?: string }).note ||
                    'Verification source for the Permanent Development Technician — same entitlement engine.'}
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-on-surface-variant">
                    <thead>
                      <tr className="border-b border-outline-variant">
                        <th className="py-2 pr-3 font-semibold">Code</th>
                        <th className="py-2 pr-3 font-semibold">Plan</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                        <th className="py-2 font-semibold">Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        (overview.data.developmentTransactions as {
                          items: Array<{
                            code: string
                            planCode: string
                            status: string
                            expiresAt: string
                          }>
                        }).items || []
                      )
                        .slice(0, 30)
                        .map((row) => (
                          <tr key={row.code} className="border-b border-outline-variant/50">
                            <td className="py-1.5 pr-3 font-mono text-on-surface">{row.code}</td>
                            <td className="py-1.5 pr-3">{row.planCode}</td>
                            <td className="py-1.5 pr-3">{row.status}</td>
                            <td className="py-1.5">
                              {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Surface>
            ) : null}

            <Surface className="space-y-3 p-5">
              <h2 className="text-lg font-semibold text-on-surface">Modules</h2>
              <div className="flex flex-wrap gap-2">
                {MODULE_ACTIONS.map((a) => (
                  <Button
                    key={a.key}
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(actionBusy)}
                    onClick={() =>
                      void run(a.key, () => seedPlatformApi.generate(a.modules), `${a.label} complete.`)
                    }
                  >
                    {a.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void run(
                      'companies',
                      () => seedPlatformApi.generate(['technicians', 'companies']),
                      'Companies stamped on technician profiles.',
                    )
                  }
                >
                  Generate Companies
                </Button>
              </div>
            </Surface>

            <Surface className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Development Subscription Simulator</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Switch the permanent Development Technician ({overview.data.developerTechnician.email}) between
                  Starter, Professional, and Business using the existing entitlement engine. Never creates
                  subscriptions, payments, invoices, or transaction IDs. Unavailable in Production Mode.
                </p>
              </div>
              {overview.data.subscriptionSimulator ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={overview.data.subscriptionSimulator.available ? 'success' : 'warning'}
                    >
                      {overview.data.subscriptionSimulator.available ? 'Available' : 'Unavailable'}
                    </StatusBadge>
                    {overview.data.subscriptionSimulator.current?.planCode ? (
                      <StatusBadge tone="info">
                        Current: {String(overview.data.subscriptionSimulator.current.planCode)}
                        {overview.data.subscriptionSimulator.current.previewActive
                          ? ' · simulation session'
                          : ''}
                      </StatusBadge>
                    ) : null}
                    {overview.data.subscriptionSimulator.platformMode ? (
                      <span className="text-xs text-on-surface-variant">
                        Platform Mode: {overview.data.subscriptionSimulator.platformMode}
                      </span>
                    ) : null}
                  </div>
                  {overview.data.subscriptionSimulator.reason ? (
                    <p className="text-sm text-warning">{overview.data.subscriptionSimulator.reason}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {(overview.data.subscriptionSimulator.availablePlans || ['STARTER', 'PROFESSIONAL', 'BUSINESS']).map(
                      (plan) => (
                        <Button
                          key={plan}
                          size="sm"
                          disabled={Boolean(actionBusy) || !overview.data?.subscriptionSimulator?.available}
                          onClick={() =>
                            void run(
                              `sim-${plan}`,
                              () => seedPlatformApi.simulatorSimulate(plan),
                              `Simulating ${plan} — entitlements refreshed (no billing records).`,
                            )
                          }
                        >
                          Simulate {plan.charAt(0) + plan.slice(1).toLowerCase()}
                        </Button>
                      ),
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(actionBusy) || !overview.data?.subscriptionSimulator?.available}
                      onClick={() =>
                        void run(
                          'sim-reset',
                          () => seedPlatformApi.simulatorReset(),
                          'Reset to default Professional (seed stamps).',
                        )
                      }
                    >
                      Reset to default
                    </Button>
                  </div>
                  {(overview.data.subscriptionSimulator.history || []).length ? (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-on-surface">Simulation history</p>
                      <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-on-surface-variant">
                        {overview.data.subscriptionSimulator.history.slice(0, 12).map((h, idx) => (
                          <li
                            key={`${h.at}-${h.action}-${idx}`}
                            className="flex flex-wrap gap-2 rounded-lg border border-border-subtle px-3 py-2"
                          >
                            <span className="font-semibold text-on-surface">{h.action}</span>
                            <span>{h.planCode}</span>
                            <span>{h.actorRole}</span>
                            <span>{new Date(h.at).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant">No simulation history yet.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">Simulator status unavailable.</p>
              )}
            </Surface>

            <SeedTechniciansPanel
              actionBusy={actionBusy}
              onBusy={setActionBusy}
              onMessage={setMessage}
              onError={setError}
            />

            <SeedCustomersPanel
              actionBusy={actionBusy}
              onBusy={setActionBusy}
              onMessage={setMessage}
              onError={setError}
            />

            <SeedScenariosPanel
              actionBusy={actionBusy}
              onBusy={setActionBusy}
              onMessage={setMessage}
              onError={setError}
            />

            <Surface className="space-y-3 p-5">
              <h2 className="text-lg font-semibold text-on-surface">Workflow fixtures</h2>
              <ul className="divide-y divide-border-subtle">
                {(overview.data.workflowFixtures || []).map((f) => (
                  <li key={f.fixtureId} className="flex items-start gap-3 py-3 text-sm">
                    <Icon name="flag" className="mt-0.5 text-on-surface-variant" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-on-surface">
                        {f.fixtureId} · {f.purpose}
                      </p>
                      <p className="truncate text-on-surface-variant">{f.title}</p>
                    </div>
                    <StatusBadge tone="info">{f.status}</StatusBadge>
                  </li>
                ))}
              </ul>
            </Surface>
          </>
        ) : null}
      </AsyncStateView>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
      {actionBusy ? <p className="text-xs text-on-surface-variant">Running: {actionBusy}…</p> : null}
    </div>
  )
}
