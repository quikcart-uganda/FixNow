import { Link } from 'react-router-dom'
import { PageHeader, Surface, Icon } from '../../components/ui'

/**
 * Dynamic Pricing is not implemented in product or API yet.
 * This workspace documents the future module without inventing mock metrics.
 */
export function DynamicPricingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dynamic Pricing"
        subtitle="Pricing rules, simulation, history, and rollback will live here when the revenue engine ships."
      />

      <Surface className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="tune" className="!text-[28px]" />
        </span>
        <h3 className="text-lg font-semibold text-ink-primary">Dynamic pricing is not available yet</h3>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          There is no pricing-rules API or simulation engine in this release. Related commercial controls
          today live in Free Jobs, Subscriptions planning, and Payments.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/admin/free-jobs"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold text-ink-primary hover:border-primary/40"
          >
            Free Jobs
          </Link>
          <Link
            to="/admin/payments"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:opacity-95"
          >
            Payments workspace
          </Link>
        </div>
      </Surface>
    </div>
  )
}
