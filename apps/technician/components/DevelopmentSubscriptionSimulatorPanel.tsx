import { useState } from 'react'
import { Button, Card, Icon } from '@fixnow/ui'
import { FormError, UX_DEVELOPMENT, uxText } from '@fixnow/shared'
import { useAsync } from '@fixnow/hooks'
import {
  developmentSubscriptionSimulatorApi,
  getFriendlyErrorMessage,
} from '@fixnow/api'
import { useApp } from '@technician/context/AppContext'

/**
 * Development-only plan switcher for the permanent Seed Development Technician.
 * Hidden for every other account. Uses existing entitlement engine (no billing docs).
 */
export function DevelopmentSubscriptionSimulatorPanel() {
  const { refreshProfile } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const status = useAsync(async () => {
    try {
      const res = await developmentSubscriptionSimulatorApi.status()
      return res.data
    } catch {
      return null
    }
  }, [])

  if (status.status === 'loading' || !status.data?.available) {
    return null
  }

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    setError(null)
    setMessage(null)
    try {
      await fn()
      await refreshProfile()
      await status.reload()
      setMessage(ok)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const current = status.data.current?.planCode || '—'

  return (
    <Card className="space-y-4 border-teal-800/20 bg-gradient-to-br from-teal-50/40 to-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800/10 text-teal-900">
          <Icon name="science" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caps text-teal-900">{uxText(UX_DEVELOPMENT.simulatorTitle)}</p>
          <h3 className="text-title">Simulate production plans</h3>
          <p className="mt-1 text-label text-on-surface-variant">
            {uxText(
              UX_DEVELOPMENT.simulatorBody(
                current,
                Boolean(status.data.current?.previewActive),
              ),
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(status.data.availablePlans || ['STARTER', 'PROFESSIONAL', 'BUSINESS']).map((plan) => (
          <Button
            key={plan}
            className="min-h-10"
            variant={String(current).toUpperCase() === plan ? undefined : 'outline'}
            disabled={Boolean(busy)}
            onClick={() =>
              void run(
                plan,
                () => developmentSubscriptionSimulatorApi.simulate(plan),
                `Now previewing ${plan}. Your dashboard will refresh with that plan's features.`,
              )
            }
          >
            {plan.charAt(0) + plan.slice(1).toLowerCase()}
          </Button>
        ))}
        <Button
          className="min-h-10"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() =>
            void run(
              'reset',
              () => developmentSubscriptionSimulatorApi.reset(),
              'Reset to default Professional.',
            )
          }
        >
          Reset default
        </Button>
      </div>
      {message ? <p className="text-label text-primary">{message}</p> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Card>
  )
}

export default DevelopmentSubscriptionSimulatorPanel
