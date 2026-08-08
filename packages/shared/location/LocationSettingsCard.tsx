import { useEffect, useState } from 'react'
import { Icon } from '@fixnow/ui'
import {
  getLocationPermissionStatus,
  openAppLocationSettings,
  type LocationPermissionRole,
  type LocationPermissionStatus,
} from '@fixnow/native'
import { LOCATION_COPY } from './locationPolicy'
import { useOptionalLocationPermission } from './LocationPermissionHost'

type Props = {
  role: LocationPermissionRole
  className?: string
}

/**
 * Settings row: view status + enable / open device settings.
 */
export function LocationSettingsCard({ role, className }: Props) {
  const host = useOptionalLocationPermission()
  const [status, setStatus] = useState<LocationPermissionStatus>(host?.status ?? 'not_requested')
  const copy = LOCATION_COPY[role]

  useEffect(() => {
    if (host) {
      setStatus(host.status)
      return
    }
    void getLocationPermissionStatus(role)
      .then(setStatus)
      .catch(() => setStatus('not_requested'))
  }, [host, host?.status, role])

  const label =
    status === 'granted'
      ? 'Enabled'
      : status === 'permanently_denied'
        ? 'Disabled in device settings'
        : status === 'denied'
          ? 'Not enabled'
          : 'Not set up yet'

  const onAction = () => {
    if (status === 'granted') return
    if (status === 'permanently_denied') {
      openAppLocationSettings()
      return
    }
    if (host) host.openLocationHelp()
    else openAppLocationSettings()
  }

  return (
    <div
      className={
        className ??
        'flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4'
      }
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-on-surface">Location</p>
        <p className="text-xs text-on-surface-variant">
          {status === 'granted'
            ? role === 'customer'
              ? 'Nearby technicians, ETAs, and live tracking.'
              : 'Nearby job matching and live customer updates.'
            : copy.fallbackNotice}
        </p>
        <p className="mt-1 text-xs font-semibold text-primary">{label}</p>
      </div>
      {status !== 'granted' ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
        >
          <Icon name={status === 'permanently_denied' ? 'settings' : 'my_location'} className="text-[18px]" />
          {status === 'permanently_denied' ? copy.openSettingsLabel : copy.enableLabel}
        </button>
      ) : (
        <span className="rounded-full bg-success-green/15 px-3 py-1 text-xs font-bold text-success-green">
          On
        </span>
      )}
    </div>
  )
}
