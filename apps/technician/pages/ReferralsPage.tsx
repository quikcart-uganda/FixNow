import { useState } from 'react'
import { getFriendlyErrorMessage, referralApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Card, Icon, Badge } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

function rewardLabel(type: string, amount: number, currency?: string) {
  switch (type) {
    case 'free_job_credit':
      return `${amount} free job credit${amount === 1 ? '' : 's'}`
    case 'lead_credit':
      return `${amount} lead credit${amount === 1 ? '' : 's'}`
    case 'points':
      return `${amount} points`
    case 'cash_wallet':
      return `${currency || 'UGX'} ${amount}`
    case 'premium_days':
      return `${amount} premium day${amount === 1 ? '' : 's'}`
    case 'featured_badge':
      return 'Featured badge'
    case 'priority_visibility':
      return `${amount} day${amount === 1 ? '' : 's'} priority visibility`
    default:
      return `${amount} ${type.replace(/_/g, ' ')}`
  }
}

export function ReferralsPage() {
  const [copied, setCopied] = useState(false)
  const [applyCode, setApplyCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const query = useAsync(async () => (await referralApi.mine()).data, [], {
    cacheKey: 'technician.referrals.v1',
    cacheFreshMs: 30_000,
  })

  const code = query.data?.code || ''
  const stats = query.data?.stats
  const campaigns = safeArray(query.data?.campaigns)
  const referrals = safeArray(query.data?.referrals)
  const rewards = safeArray(query.data?.rewards)

  const share = async () => {
    if (!code) return
    try {
      const { copyToClipboard, shareContent, haptic } = await import('@fixnow/native')
      await shareContent({
        title: 'Join FixNow',
        text: `Use my FixNow invite code ${code}`,
      })
      await copyToClipboard(code)
      void haptic('success')
    } catch {
      try {
        await navigator.clipboard.writeText(code)
      } catch {
        /* ignore */
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const apply = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await referralApi.apply(applyCode.trim())
      setMessage('Referral code applied.')
      setApplyCode('')
      await query.reload()
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Referrals</h1>
        <p className="text-body text-on-surface-variant">
          Invite technicians and customers. Rewards are controlled by live admin campaigns — never hardcoded.
        </p>
      </div>

      <AsyncStateView
        status={query.status === 'error' ? 'error' : query.isLoading && !query.data ? 'loading' : 'success'}
        error={query.error}
        onRetry={() => void query.reload()}
      >
        <Card className="trust-gradient p-6 text-white">
          <p className="text-caps text-primary-fixed/80">Your invite code</p>
          <p className="mt-3 text-display-mobile tracking-widest">{code || '—'}</p>
          {campaigns[0] ? (
            <p className="mt-2 text-body text-on-primary-container">
              Active: {String(campaigns[0].name)} — earn{' '}
              {rewardLabel(
                String(campaigns[0].rewardType),
                Number(campaigns[0].rewardAmount || 0),
                campaigns[0].currency ? String(campaigns[0].currency) : undefined,
              )}{' '}
              after {String(campaigns[0].trigger || '').replace(/_/g, ' ')}.
            </p>
          ) : (
            <p className="mt-2 text-body text-on-primary-container">
              Share your code. Rewards appear here when an admin campaign is active.
            </p>
          )}
          <Button className="mt-5 !bg-white !text-primary" disabled={!code} onClick={() => void share()}>
            <Icon name="content_copy" />
            {copied ? 'Copied' : 'Copy & share code'}
          </Button>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Pending', stats?.pending ?? 0],
            ['Successful', stats?.successful ?? 0],
            ['Rewards earned', stats?.rewardsEarned ?? 0],
            ['Rewards pending', stats?.rewardsPending ?? 0],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-caps text-on-surface-variant">{label}</p>
              <p className="mt-1 text-headline tabular-nums">{value}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="text-title">Active campaigns</h2>
            {campaigns.length ? (
              campaigns.map((c) => (
                <div key={String(c.id)} className="rounded-xl border border-border-subtle p-3">
                  <p className="font-semibold">{String(c.name)}</p>
                  <p className="text-label text-on-surface-variant">
                    Invite {String(c.inviteRole)} · trigger {String(c.trigger).replace(/_/g, ' ')} ·{' '}
                    {rewardLabel(String(c.rewardType), Number(c.rewardAmount || 0), c.currency ? String(c.currency) : undefined)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-label text-on-surface-variant">No active campaigns right now.</p>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-title">Apply a code</h2>
            <p className="text-label text-on-surface-variant">
              If someone invited you, enter their code once. Fraud checks run automatically.
            </p>
            <input
              className="h-11 w-full rounded-xl border border-border px-3 uppercase"
              placeholder="INVITE CODE"
              value={applyCode}
              onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
            />
            <Button disabled={busy || !applyCode.trim()} onClick={() => void apply()}>
              {busy ? 'Applying…' : 'Apply code'}
            </Button>
            {message ? <p className="text-sm text-on-surface-variant">{message}</p> : null}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="text-title">Your referrals</h2>
          <div className="mt-3 space-y-2">
            {referrals.length ? (
              referrals.map((r) => (
                <div
                  key={String(r.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2"
                >
                  <div>
                    <p className="text-label font-semibold">{String(r.code)}</p>
                    <p className="text-caps text-on-surface-variant">
                      {(r.milestonesCompleted as string[] | undefined)?.length
                        ? `Milestones: ${(r.milestonesCompleted as string[]).join(', ')}`
                        : 'Awaiting milestone'}
                    </p>
                  </div>
                  <Badge>{String(r.status)}</Badge>
                </div>
              ))
            ) : (
              <p className="text-label text-on-surface-variant">No referrals yet — share your code to get started.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-title">Rewards</h2>
          <div className="mt-3 space-y-2">
            {rewards.length ? (
              rewards.map((rw) => (
                <div
                  key={String(rw.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2"
                >
                  <p className="text-label">
                    {rewardLabel(String(rw.rewardType), Number(rw.amount || 0), rw.currency ? String(rw.currency) : undefined)}
                  </p>
                  <Badge tone={rw.status === 'granted' ? 'success' : 'warning'}>{String(rw.status)}</Badge>
                </div>
              ))
            ) : (
              <p className="text-label text-on-surface-variant">No rewards issued yet.</p>
            )}
          </div>
        </Card>
      </AsyncStateView>
    </div>
  )
}
