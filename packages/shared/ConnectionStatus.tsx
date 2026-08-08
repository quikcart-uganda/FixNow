/**
 * Compact connection indicator.
 * Prefer `HeaderStatusControl` for new portal headers (opens a status sheet).
 * This wrapper remains for any legacy call sites and always opens the same sheet
 * so "Live" is never a dead affordance.
 */
import { HeaderStatusControl } from './header/HeaderStatusControl'
import type { PortalRole } from './header/types'

export function ConnectionStatus({
  className = '',
  role = 'customer',
}: {
  className?: string
  role?: PortalRole
}) {
  return <HeaderStatusControl role={role} className={className} />
}
