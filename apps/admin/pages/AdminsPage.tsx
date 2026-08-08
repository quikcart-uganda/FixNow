import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { useAsync, useAuth, useDebouncedValue } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import {
  Button,
  Icon,
  PageHeader,
  SearchField,
  SelectField,
  Surface,
} from '../components/ui'
import { safeArray } from '@fixnow/utils'
import { AdminCard } from '../components/admins/AdminCard'
import { AdminDetailDrawer } from '../components/admins/AdminDetailDrawer'
import { AdminSummaryCards, type AdminCounts } from '../components/admins/AdminSummaryCards'
import { AdminTable } from '../components/admins/AdminTable'
import { InviteAdminDialog } from '../components/admins/InviteAdminDialog'
import type { AdminAction, AdminDetailTab } from '../components/admins/adminMenu'
import {
  ADMIN_STATUS,
  statusMeta,
  type AdminOperator,
} from '../components/admins/adminHelpers'

const DESTRUCTIVE_CONFIRM: Record<string, string> = {
  [ADMIN_STATUS.suspended]: 'Suspend {name}? They lose Command Center access until reactivated.',
  [ADMIN_STATUS.disabled]: 'Disable {name}? Their account stays on record but cannot sign in.',
  [ADMIN_STATUS.locked]: 'Lock {name}? Sign-in is blocked until an administrator unlocks them.',
  [ADMIN_STATUS.archived]: 'Archive {name}? They move out of the active directory and lose access.',
  [ADMIN_STATUS.deleted]: 'Delete {name}? This soft-deletes the operator and revokes access immediately.',
}

export function AdminsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selected, setSelected] = useState<AdminOperator | null>(null)
  const [detailTab, setDetailTab] = useState<AdminDetailTab>('profile')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const catalogueQuery = useAsync(async () => {
    const res = await adminApi.identityCatalogue()
    return res.data
  }, [])

  const listQuery = useAsync(async () => {
    const res = await adminApi.listAdmins({
      q: debouncedSearch.trim() || undefined,
      status: status || undefined,
      role: role || undefined,
      limit: 100,
    })
    return res.data.items as AdminOperator[]
  }, [debouncedSearch, status, role])

  // Unfiltered snapshot powers the summary tiles and the department options.
  const directoryQuery = useAsync(async () => {
    const res = await adminApi.listAdmins({ limit: 100 })
    return res.data.items as AdminOperator[]
  }, [])

  const roles = catalogueQuery.data?.productionRoles?.length
    ? catalogueQuery.data.productionRoles
    : (catalogueQuery.data?.roles ?? []).filter((r) =>
        ['super_admin', 'finance', 'support'].includes(r.key),
      )
  const permissions = catalogueQuery.data?.permissions ?? []
  const statuses = catalogueQuery.data?.statuses ?? []

  const counts = useMemo<AdminCounts | null>(() => {
    const rows = directoryQuery.data
    if (!rows) return null
    const by = (value: string) => rows.filter((row) => row.status === value).length
    return {
      total: rows.length,
      active: by(ADMIN_STATUS.active),
      pending: by(ADMIN_STATUS.pendingInvitation),
      locked: by(ADMIN_STATUS.locked),
      suspended: by(ADMIN_STATUS.suspended),
    }
  }, [directoryQuery.data])

  const departments = useMemo(() => {
    const values = new Set<string>()
    for (const row of safeArray(directoryQuery.data)) {
      if (row.department?.trim()) values.add(row.department.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [directoryQuery.data])

  // The API has no department parameter, so that one filter is applied locally.
  const visible = useMemo(() => {
    const rows = safeArray(listQuery.data)
    if (!department) return rows
    return rows.filter((row) => row.department === department)
  }, [listQuery.data, department])

  const filtersActive = Boolean(search || status || role || department)

  async function refresh() {
    const [rows] = await Promise.all([listQuery.reload(), directoryQuery.reload()])
    if (selected && rows) {
      setSelected(rows.find((row) => row.id === selected.id) ?? null)
    }
  }

  async function changeStatus(admin: AdminOperator, next: string) {
    setError(null)
    setNotice(null)
    const template = DESTRUCTIVE_CONFIRM[next]
    if (template) {
      const message = template.replace('{name}', admin.fullName || admin.email)
      if (!window.confirm(message)) return
    }
    setActing(true)
    try {
      await adminApi.updateAdminStatus(admin.id, next)
      setNotice(
        `${admin.fullName || admin.email} is now ${statusMeta(next).label.toLowerCase()}.`,
      )
      await refresh()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setActing(false)
    }
  }

  function handleAction(admin: AdminOperator, action: AdminAction) {
    if (action.type === 'open') {
      setSelected(admin)
      setDetailTab(action.tab)
      return
    }
    void changeStatus(admin, action.status)
  }

  function openDetails(admin: AdminOperator) {
    setSelected(admin)
    setDetailTab('profile')
  }

  function clearFilters() {
    setSearch('')
    setStatus('')
    setRole('')
    setDepartment('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrators"
        subtitle="Invite operators, assign roles, and manage the administrator lifecycle."
        actions={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setInviteOpen(true)}>
            <Icon name="person_add" className="!text-[18px]" />
            Invite administrator
          </Button>
        }
      />

      <AdminSummaryCards
        counts={counts}
        loading={directoryQuery.status === 'loading'}
        selectedStatus={status}
        onSelectStatus={(next) => setStatus((current) => (current === next ? '' : next))}
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-ink-primary">
          {notice}
        </p>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchField
            label="Search administrators by name, email, or department"
            placeholder="Search administrators…"
            value={search}
            onChange={setSearch}
            className="lg:max-w-sm lg:flex-1"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:items-center">
            <SelectField label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((option) => (
                <option key={option} value={option}>
                  {statusMeta(option).label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Filter by department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="col-span-2 sm:col-span-1"
            >
              <option value="">All departments</option>
              {departments.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex items-center justify-between gap-3 lg:ml-auto">
            <p className="text-[13px] text-ink-muted" aria-live="polite">
              {listQuery.status === 'loading'
                ? 'Loading…'
                : `${visible.length} administrator${visible.length === 1 ? '' : 's'}`}
            </p>
            {filtersActive ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <AsyncStateView
          status={visible.length === 0 && listQuery.status === 'success' ? 'empty' : listQuery.status}
          error={listQuery.error}
          onRetry={() => void listQuery.reload()}
          emptyTitle={filtersActive ? 'No administrators match these filters' : 'No administrators yet'}
          emptyHint={
            filtersActive
              ? 'Try a different role, status, or department.'
              : 'Invite an operator to get started.'
          }
          emptyIcon="admin_panel_settings"
          emptyActionLabel={filtersActive ? 'Clear filters' : 'Invite administrator'}
          onEmptyAction={filtersActive ? clearFilters : () => setInviteOpen(true)}
        >
          <ul className="space-y-3 p-4 lg:hidden">
            {visible.map((admin) => (
              <AdminCard
                key={admin.id}
                admin={admin}
                roles={roles}
                isSelf={Boolean(user?.id) && admin.userId === user?.id}
                onOpen={() => openDetails(admin)}
                onAction={(action) => handleAction(admin, action)}
              />
            ))}
          </ul>

          <div className="hidden lg:block">
            <AdminTable
              admins={visible}
              roles={roles}
              currentUserId={user?.id ?? null}
              onOpen={openDetails}
              onAction={handleAction}
            />
          </div>
        </AsyncStateView>
      </Surface>

      <p className="text-xs text-ink-muted">
        Invitees activate their own password at{' '}
        <Link className="text-primary underline" to="/admin/accept-invite">
          Accept invitation
        </Link>
        . Administrator passwords are never shared directly.
      </p>

      <InviteAdminDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={roles}
        onInvited={(message) => {
          setNotice(message)
          setError(null)
          void refresh()
        }}
      />

      <AdminDetailDrawer
        admin={selected}
        open={Boolean(selected)}
        tab={detailTab}
        onTabChange={setDetailTab}
        onClose={() => setSelected(null)}
        roles={roles}
        permissions={permissions}
        currentUserId={user?.id ?? null}
        onAction={handleAction}
        onMutated={() => void refresh()}
      />

      <span className="sr-only" aria-live="polite">
        {acting ? 'Applying administrator change…' : ''}
      </span>
    </div>
  )
}
