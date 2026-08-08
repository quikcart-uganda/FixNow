import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import { companyTeamApi, getFriendlyErrorMessage } from '@fixnow/api'
import { AsyncStateView, FormError } from '@fixnow/shared'
import { safeArray, safeNumber } from '@fixnow/utils'

type Tab = 'employees' | 'dispatch' | 'assignments' | 'performance' | 'availability' | 'settings'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'employees', label: 'Employees' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'performance', label: 'Performance' },
  { id: 'availability', label: 'Availability' },
  { id: 'settings', label: 'Company' },
]

const ASSIGNMENT_FILTERS = [
  { id: '', label: 'All' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'technician_en_route', label: 'Travelling' },
  { id: 'in_progress', label: 'Working' },
  { id: 'awaiting_confirmation', label: 'Pending confirm' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

/**
 * Business team hub — employees, dispatch, assignments, performance, availability, company settings.
 * Fully operational (no placeholder / coming-soon UI).
 */
export function BusinessTeamPage() {
  const [tab, setTab] = useState<Tab>('employees')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'employee' | 'dispatcher'>('employee')
  const [memberQuery, setMemberQuery] = useState('')
  const [assignmentStatus, setAssignmentStatus] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [assignJobId, setAssignJobId] = useState<string | null>(null)

  const myInvites = useAsync(async () => (await companyTeamApi.myInvites()).data, [])
  const overview = useAsync(async () => (await companyTeamApi.overview()).data, [])
  const dispatch = useAsync(async () => (await companyTeamApi.dispatch()).data, [], {
    enabled: tab === 'dispatch',
  })
  const assignments = useAsync(
    async () => (await companyTeamApi.assignments(assignmentStatus || undefined)).data,
    [assignmentStatus],
    { enabled: tab === 'assignments' },
  )
  const performance = useAsync(async () => (await companyTeamApi.performance()).data, [], {
    enabled: tab === 'performance',
  })
  const availability = useAsync(async () => (await companyTeamApi.availability()).data, [], {
    enabled: tab === 'availability',
  })

  const companyName = String(
    overview.data?.company?.name ||
      dispatch.data?.company?.name ||
      performance.data?.company?.name ||
      'Your company',
  )

  async function run(key: string, fn: () => Promise<void>, ok?: string) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (ok) setNotice(ok)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const members = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    return safeArray(overview.data?.members)
      .filter((m) => String(m.status) !== 'removed')
      .filter((m) => {
        if (!q) return true
        return (
          String(m.name || '')
            .toLowerCase()
            .includes(q) ||
          String(m.email || '')
            .toLowerCase()
            .includes(q) ||
          String(m.role || '')
            .toLowerCase()
            .includes(q)
        )
      })
  }, [overview.data?.members, memberQuery])

  const pendingInvites = safeArray(myInvites.data?.invites)

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
          <p className="text-caps text-teal-800">Business · Team</p>
          <h1 className="text-headline">{companyName}</h1>
          <p className="mt-2 max-w-2xl text-body text-on-surface-variant">
            Invite technicians, dispatch jobs, track assignments, and monitor team performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => void overview.reload()}>
            Refresh
          </Button>
          <Link to="/technician/business/company">
            <Button variant="outline" className="min-h-11">
              Brand profile
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-teal-800 text-white' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <FormError>{error}</FormError> : null}
      {notice ? <p className="text-label text-tertiary">{notice}</p> : null}

      {pendingInvites.length > 0 ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-title">Invitations for you</h2>
          {pendingInvites.map((inv) => (
            <div key={String(inv.id)} className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-label">
                {String(inv.companyName || 'Company')} · join as {String(inv.role)} · expires{' '}
                {inv.expiresAt ? new Date(String(inv.expiresAt)).toLocaleDateString() : '—'}
              </p>
              <Button
                className="min-h-10"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(
                    `accept-${inv.id}`,
                    async () => {
                      await companyTeamApi.acceptInvite(String(inv.token))
                      await myInvites.reload()
                      await overview.reload()
                    },
                    'You joined the company team.',
                  )
                }
              >
                {busy === `accept-${inv.id}` ? 'Joining…' : 'Accept invite'}
              </Button>
            </div>
          ))}
        </Card>
      ) : null}

      {tab === 'employees' ? (
        <AsyncStateView status={overview.status} error={overview.error} onRetry={() => void overview.reload()}>
          {overview.data ? (
            <div className="space-y-4">
              <Card className="space-y-3 p-5">
                <h2 className="text-title">Invite a technician</h2>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className="min-h-11 rounded-xl border border-outline-variant px-3"
                    placeholder="technician@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select
                    className="min-h-11 rounded-xl border border-outline-variant px-3"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'employee' | 'dispatcher')}
                  >
                    <option value="employee">Employee</option>
                    <option value="dispatcher">Dispatcher</option>
                  </select>
                  <Button
                    className="min-h-11"
                    disabled={Boolean(busy) || !inviteEmail.trim()}
                    onClick={() =>
                      void run(
                        'invite',
                        async () => {
                          await companyTeamApi.invite({ email: inviteEmail.trim(), role: inviteRole })
                          setInviteEmail('')
                          await overview.reload()
                        },
                        'Invitation sent.',
                      )
                    }
                  >
                    {busy === 'invite' ? 'Sending…' : 'Send invite'}
                  </Button>
                </div>
              </Card>

              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-title">Team members</h2>
                  <p className="text-label text-on-surface-variant">
                    {safeNumber(overview.data.counts?.active)} active ·{' '}
                    {safeNumber(overview.data.counts?.invited)} invites
                  </p>
                </div>
                <input
                  className="min-h-11 w-full rounded-xl border border-outline-variant px-3 sm:max-w-sm"
                  placeholder="Search name, email, or role"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                {members.length === 0 ? (
                  <p className="text-label text-on-surface-variant">
                    No employees yet. Invite your first technician to begin assigning work.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {members.map((m) => (
                      <li key={String(m.id)} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-label font-semibold">
                            {String(m.name)}{' '}
                            <span className="text-caps text-on-surface-variant">
                              {String(m.role)} · {String(m.status)}
                            </span>
                          </p>
                          <p className="text-caps text-outline">
                            {String(m.email || '—')} · ★{safeNumber(m.rating).toFixed(1)} ·{' '}
                            {safeNumber(m.activeJobs)} active jobs ·{' '}
                            {m.isAvailableNow ? 'Available' : 'Offline'}
                          </p>
                          {safeArray(m.skills as unknown[]).length > 0 ? (
                            <p className="mt-1 text-caps text-on-surface-variant">
                              Skills: {safeArray(m.skills as unknown[]).slice(0, 6).map(String).join(', ')}
                            </p>
                          ) : null}
                        </div>
                        {String(m.role) !== 'owner' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="min-h-10 rounded-xl border border-outline-variant px-2 text-sm"
                              value={String(m.role)}
                              disabled={Boolean(busy)}
                              onChange={(e) => {
                                const role = e.target.value as 'dispatcher' | 'employee'
                                void run(`role-${m.id}`, async () => {
                                  await companyTeamApi.updateMember(String(m.id), { role })
                                  await overview.reload()
                                })
                              }}
                            >
                              <option value="employee">Employee</option>
                              <option value="dispatcher">Dispatcher</option>
                            </select>
                            {String(m.status) === 'active' ? (
                              <Button
                                variant="outline"
                                className="min-h-10"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void run(`sus-${m.id}`, async () => {
                                    await companyTeamApi.updateMember(String(m.id), { status: 'suspended' })
                                    await overview.reload()
                                  })
                                }
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                className="min-h-10"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void run(`act-${m.id}`, async () => {
                                    await companyTeamApi.updateMember(String(m.id), { status: 'active' })
                                    await overview.reload()
                                  })
                                }
                              >
                                Activate
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              className="min-h-10"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                void run(`rm-${m.id}`, async () => {
                                  await companyTeamApi.updateMember(String(m.id), { status: 'removed' })
                                  await overview.reload()
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {safeArray(overview.data.invites).length > 0 ? (
                <Card className="space-y-2 p-5">
                  <h2 className="text-title">Pending invites</h2>
                  {safeArray(overview.data.invites).map((inv) => (
                    <p key={String(inv.id)} className="text-label text-on-surface-variant">
                      {String(inv.email)} · {String(inv.role)} · expires{' '}
                      {inv.expiresAt ? new Date(String(inv.expiresAt)).toLocaleDateString() : '—'}
                    </p>
                  ))}
                </Card>
              ) : null}
            </div>
          ) : null}
        </AsyncStateView>
      ) : null}

      {tab === 'dispatch' ? (
        <AsyncStateView status={dispatch.status} error={dispatch.error} onRetry={() => void dispatch.reload()}>
          {dispatch.data ? (
            <div className="space-y-4">
              {safeNumber(dispatch.data.autoAssigned) > 0 ? (
                <p className="text-label text-tertiary">
                  Auto-assign placed {safeNumber(dispatch.data.autoAssigned)} job
                  {safeNumber(dispatch.data.autoAssigned) === 1 ? '' : 's'} with available technicians.
                </p>
              ) : null}
              <Card className="space-y-3 p-5">
                <h2 className="text-title">Recommended technicians</h2>
                <p className="text-label text-on-surface-variant">
                  Ranked by availability, skill fit, district, rating, response history, and current workload.
                </p>
                {safeArray(dispatch.data.recommendations).length === 0 ? (
                  <p className="text-label text-on-surface-variant">
                    No active team members yet. Invite technicians to enable dispatch recommendations.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {safeArray(dispatch.data.recommendations).map((r) => (
                      <li key={String(r.userId)} className="rounded-xl bg-surface-container-low px-3 py-2 text-label">
                        <p className="font-semibold">
                          {String(r.name)} · score {safeNumber(r.score)}
                        </p>
                        <p className="text-caps text-outline">
                          {r.available ? 'Available' : 'Offline'} · workload {safeNumber(r.workload)} · ★
                          {safeNumber(r.rating).toFixed(1)}
                          {r.skillMatch ? ' · skill match' : ''}
                          {r.districtMatch ? ' · nearby' : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-title">Open jobs</h2>
                  <Button variant="outline" className="min-h-10" onClick={() => void dispatch.reload()}>
                    Refresh queue
                  </Button>
                </div>
                {safeArray(dispatch.data.queue?.open).length === 0 ? (
                  <p className="text-label text-on-surface-variant">
                    No open jobs in the queue right now. New customer jobs will appear here for dispatch.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {safeArray(dispatch.data.queue.open).map((job) => (
                      <li key={String(job.id)} className="rounded-xl border border-border-subtle p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-label font-semibold">{String(job.title)}</p>
                            <p className="text-caps text-outline">
                              {String(job.district || '—')} · {String(job.status)}
                              {job.hasTeamApplication ? ' · team applied' : ''}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            className="min-h-10"
                            onClick={() => setAssignJobId(String(job.id))}
                          >
                            Assign
                          </Button>
                        </div>
                        {assignJobId === String(job.id) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {safeArray(dispatch.data.recommendations).map((r) => (
                              <Button
                                key={String(r.userId)}
                                className="min-h-10"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void run(
                                    `asg-${job.id}-${r.userId}`,
                                    async () => {
                                      await companyTeamApi.assign({
                                        jobId: String(job.id),
                                        technicianUserId: String(r.userId),
                                      })
                                      setAssignJobId(null)
                                      await dispatch.reload()
                                      await assignments.reload()
                                    },
                                    `Assigned to ${String(r.name)}.`,
                                  )
                                }
                              >
                                {String(r.name)}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3 p-5">
                <h2 className="text-title">Active with your team</h2>
                {safeArray(dispatch.data.queue?.active).length === 0 ? (
                  <p className="text-label text-on-surface-variant">No active team assignments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {safeArray(dispatch.data.queue.active).map((job) => (
                      <li
                        key={String(job.id)}
                        className="flex flex-wrap items-center justify-between gap-2 text-label"
                      >
                        <span>
                          {String(job.title)} · {String(job.status)}
                        </span>
                        <Button
                          variant="outline"
                          className="min-h-10"
                          onClick={() => setAssignJobId(String(job.id))}
                        >
                          Reassign
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : null}
        </AsyncStateView>
      ) : null}

      {tab === 'assignments' ? (
        <AsyncStateView
          status={assignments.status}
          error={assignments.error}
          onRetry={() => void assignments.reload()}
        >
          {assignments.data ? (
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-title">Assignments</h2>
                <Button variant="outline" className="min-h-10" onClick={() => void assignments.reload()}>
                  Refresh
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ASSIGNMENT_FILTERS.map((f) => (
                  <button
                    key={f.id || 'all'}
                    type="button"
                    onClick={() => setAssignmentStatus(f.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      assignmentStatus === f.id
                        ? 'bg-teal-800 text-white'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {safeArray(assignments.data.items).length === 0 ? (
                <p className="text-label text-on-surface-variant">
                  No assignments yet. Dispatch an open job to a team member to start tracking work here.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {safeArray(assignments.data.items).map((item) => (
                    <li
                      key={String(item.id)}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <p className="text-label font-semibold">{String(item.title)}</p>
                        <p className="text-caps text-outline">
                          {String(item.status)} ·{' '}
                          {item.technician
                            ? String((item.technician as { name?: string }).name || 'Technician')
                            : 'Unassigned'}
                        </p>
                      </div>
                      <Link to={`/technician/jobs/${String(item.id)}`}>
                        <Button variant="outline" className="min-h-10">
                          Open
          </Button>
        </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </AsyncStateView>
      ) : null}

      {tab === 'performance' ? (
        <AsyncStateView
          status={performance.status}
          error={performance.error}
          onRetry={() => void performance.reload()}
        >
          {performance.data ? (
            <div className="space-y-4">
              <section className="grid gap-3 sm:grid-cols-4">
                {[
                  ['Team size', performance.data.summary?.teamSize],
                  ['Jobs completed', performance.data.summary?.jobsCompleted],
                  ['Active jobs', performance.data.summary?.activeJobs],
                  ['Avg rating', performance.data.summary?.averageRating],
                ].map(([label, value]) => (
                  <Card key={String(label)} className="p-4">
                    <p className="text-caps text-on-surface-variant">{label}</p>
                    <p className="mt-1 text-title tabular-nums">{String(value ?? 0)}</p>
                  </Card>
                ))}
              </section>
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-title">Technician rankings</h2>
                  <Button variant="outline" className="min-h-10" onClick={() => void performance.reload()}>
                    Refresh
                  </Button>
                </div>
                {safeArray(performance.data.rankings).length === 0 ? (
                  <p className="text-label text-on-surface-variant">
                    Performance data appears once your team completes jobs.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {safeArray(performance.data.rankings).map((row, idx) => (
                      <li
                        key={String(row.userId)}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <p className="text-label font-semibold">
                          #{idx + 1} {String(row.name)}
                        </p>
                        <p className="text-caps text-outline">
                          {safeNumber(row.jobsCompleted)} completed · ★{safeNumber(row.rating).toFixed(1)} ·{' '}
                          {safeNumber(row.completionRate)}% completion · response{' '}
                          {safeNumber(row.responseScore)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : null}
        </AsyncStateView>
      ) : null}

      {tab === 'availability' ? (
        <AsyncStateView
          status={availability.status}
          error={availability.error}
          onRetry={() => void availability.reload()}
        >
          {availability.data ? (
            <div className="space-y-4">
              <Card className="grid gap-3 p-5 sm:grid-cols-3">
                <div>
                  <p className="text-caps text-on-surface-variant">Available</p>
                  <p className="text-title">{safeNumber(availability.data.coverage?.available)}</p>
                </div>
                <div>
                  <p className="text-caps text-on-surface-variant">Offline</p>
                  <p className="text-title">{safeNumber(availability.data.coverage?.offline)}</p>
                </div>
                <div>
                  <p className="text-caps text-on-surface-variant">Coverage gaps</p>
                  <p className="text-label">
                    {safeArray(availability.data.coverage?.gaps as unknown[]).length
                      ? safeArray(availability.data.coverage?.gaps as unknown[]).join(', ')
                      : 'None'}
                  </p>
                </div>
              </Card>
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-title">Team availability</h2>
                  <Button variant="outline" className="min-h-10" onClick={() => void availability.reload()}>
                    Refresh
                  </Button>
                </div>
                {safeArray(availability.data.items).length === 0 ? (
                  <p className="text-label text-on-surface-variant">
                    Invite technicians to see company-wide availability for dispatch.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {safeArray(availability.data.items).map((item) => (
                      <li
                        key={String(item.userId)}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            name={item.isAvailableNow ? 'check_circle' : 'schedule'}
                            className={item.isAvailableNow ? 'text-tertiary' : 'text-outline'}
                          />
                          <div>
                            <p className="text-label font-semibold">{String(item.name)}</p>
                            <p className="text-caps text-outline">
                              {String(item.status)} · {String(item.role)} · {String(item.district || '—')}
                            </p>
                            {safeArray(item.workingHours as unknown[]).length > 0 ? (
                              <p className="mt-1 text-caps text-on-surface-variant">
                                Shifts on file: {safeArray(item.workingHours as unknown[]).length} day
                                {safeArray(item.workingHours as unknown[]).length === 1 ? '' : 's'}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : null}
        </AsyncStateView>
      ) : null}

      {tab === 'settings' ? (
        <AsyncStateView status={overview.status} error={overview.error} onRetry={() => void overview.reload()}>
          {overview.data ? (
            <Card className="space-y-4 p-5">
              <h2 className="text-title">Company management</h2>
              <p className="text-label text-on-surface-variant">
                Control dispatch behaviour and the company name used across team tools. Branding lives in
                Company profile.
              </p>
              <label className="block space-y-1">
                <span className="text-label text-on-surface-variant">Company name</span>
                <input
                  className="min-h-11 w-full rounded-xl border border-outline-variant px-3"
                  defaultValue={String(overview.data.company?.name || '')}
                  id="company-team-name"
                />
              </label>
              <label className="flex items-center gap-3 text-label">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(
                    (overview.data.company?.settings as { autoAssignEnabled?: boolean } | undefined)
                      ?.autoAssignEnabled,
                  )}
                  id="company-auto-assign"
                />
                Automatically assign open jobs to the best available technician
              </label>
              <label className="flex items-center gap-3 text-label">
                <input
                  type="checkbox"
                  defaultChecked={
                    (overview.data.company?.settings as { notifyOnDispatch?: boolean } | undefined)
                      ?.notifyOnDispatch !== false
                  }
                  id="company-notify-dispatch"
                />
                Notify technicians when they are dispatched
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      'settings',
                      async () => {
                        const nameEl = document.getElementById('company-team-name') as HTMLInputElement | null
                        const autoEl = document.getElementById('company-auto-assign') as HTMLInputElement | null
                        const notifyEl = document.getElementById(
                          'company-notify-dispatch',
                        ) as HTMLInputElement | null
                        await companyTeamApi.updateSettings({
                          name: nameEl?.value?.trim() || undefined,
                          autoAssignEnabled: Boolean(autoEl?.checked),
                          notifyOnDispatch: Boolean(notifyEl?.checked),
                        })
                        await overview.reload()
                      },
                      'Company settings saved.',
                    )
                  }
                >
                  {busy === 'settings' ? 'Saving…' : 'Save settings'}
                </Button>
                <Link to="/technician/business/company">
                  <Button variant="outline" className="min-h-11">
                    Edit brand profile
                  </Button>
        </Link>
      </div>
            </Card>
          ) : null}
        </AsyncStateView>
      ) : null}
    </div>
  )
}

/** Route-compatible alias (formerly placeholder). */
export function TeamPlaceholderPage() {
  return <BusinessTeamPage />
}

export default BusinessTeamPage
