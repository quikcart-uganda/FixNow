import { useEffect, useState, type FormEvent } from 'react'
import { adminApi, getFriendlyErrorMessage } from '@fixnow/api/admin'
import { Dialog } from '@fixnow/shared'
import { Button, Icon } from '../ui'
import type { AdminRoleOption } from './adminHelpers'

const FIELD =
  'min-h-11 w-full rounded-lg border border-border bg-canvas px-3 text-sm text-ink-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/25'

type InviteForm = {
  email: string
  fullName: string
  department: string
  adminRoleKey: string
}

const EMPTY: InviteForm = { email: '', fullName: '', department: '', adminRoleKey: '' }

export function InviteAdminDialog({
  open,
  onClose,
  roles,
  onInvited,
}: {
  open: boolean
  onClose: () => void
  roles: AdminRoleOption[]
  onInvited: (message: string) => void
}) {
  const [form, setForm] = useState<InviteForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    // No default role — Super Admin must choose explicitly.
    setForm(EMPTY)
  }, [open])

  const selectedRole = roles.find((role) => role.key === form.adminRoleKey)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.adminRoleKey) {
      setError('Select a role: Super Admin, Finance Admin, or Support Admin.')
      return
    }
    setSubmitting(true)
    try {
      const res = await adminApi.inviteAdmin({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        department: form.department.trim() || undefined,
        adminRoleKey: form.adminRoleKey,
      })
      onInvited(
        res.data.acceptUrl
          ? `Invitation created for ${res.data.email}. Development accept link: ${res.data.acceptUrl}`
          : `Invitation emailed to ${res.data.email}.`,
      )
      setForm(EMPTY)
      onClose()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite administrator"
      description="Operators activate their own password from the invitation email — never share credentials."
      panelClassName="!max-w-lg"
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {error ? (
          <p role="alert" className="rounded-lg border border-error/30 bg-error/5 px-3 py-2.5 text-[13px] text-error">
            {error}
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink-primary">Work email</span>
          <input
            required
            type="email"
            autoComplete="off"
            data-autofocus
            className={FIELD}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink-primary">Full name</span>
          <input
            required
            className={FIELD}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink-primary">Department</span>
            <input
              className={FIELD}
              placeholder="Optional"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink-primary">Role</span>
            <select
              required
              className={FIELD}
              value={form.adminRoleKey}
              onChange={(e) => setForm((f) => ({ ...f, adminRoleKey: e.target.value }))}
            >
              <option value="" disabled>
                Select role…
              </option>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedRole ? (
          <p className="flex gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
            <Icon name="shield_person" className="!text-[16px] shrink-0 opacity-70" />
            <span>
              {selectedRole.description} · {selectedRole.permissionKeys.length} permission
              {selectedRole.permissionKeys.length === 1 ? '' : 's'}
            </span>
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" className="sm:flex-1" disabled={submitting}>
            <Icon name="send" className="!text-[18px]" />
            {submitting ? 'Sending…' : 'Send invitation'}
          </Button>
          <Button type="button" variant="secondary" className="sm:flex-1" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
