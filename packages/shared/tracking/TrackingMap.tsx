import { useEffect, useRef, useState } from 'react'

export type MapPoint = { lat: number; lng: number; label?: string }

type TrackingMapProps = {
  technician?: MapPoint | null
  customer?: MapPoint | null
  route?: Array<{ lat: number; lng: number }>
  className?: string
  heightClassName?: string
}

type GoogleMapsNs = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      setCenter: (c: { lat: number; lng: number }) => void
      fitBounds: (b: unknown) => void
    }
    Marker: new (opts: Record<string, unknown>) => { setPosition: (p: { lat: number; lng: number }) => void; setMap: (m: unknown) => void }
    Polyline: new (opts: Record<string, unknown>) => { setPath: (p: Array<{ lat: number; lng: number }>) => void; setMap: (m: unknown) => void }
    LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void }
    SymbolPath: { CIRCLE: unknown }
  }
}

type MapsWindow = Window & {
  google?: GoogleMapsNs
  __fixnowMapsPromise?: Promise<GoogleMapsNs | null>
}

function mapsWindow(): MapsWindow {
  return window as MapsWindow
}

function mapsApiKey() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || ''
}

function loadGoogleMaps(): Promise<GoogleMapsNs | null> {
  const key = mapsApiKey()
  if (!key) return Promise.resolve(null)
  const browser = mapsWindow()
  if (browser.google?.maps) return Promise.resolve(browser.google)
  if (browser.__fixnowMapsPromise) return browser.__fixnowMapsPromise

  browser.__fixnowMapsPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fixnow-maps]')
    if (existing) {
      existing.addEventListener('load', () => resolve(browser.google ?? null))
      existing.addEventListener('error', () => resolve(null))
      return
    }
    const script = document.createElement('script')
    script.dataset.fixnowMaps = '1'
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`
    script.onload = () => resolve(browser.google ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return browser.__fixnowMapsPromise
}

/**
 * Live tracking map. Uses Google Maps JS when `VITE_GOOGLE_MAPS_API_KEY` is set;
 * otherwise renders a status-first fallback panel (QuikCart-inspired degradation).
 */
export function TrackingMap({
  technician,
  customer,
  route = [],
  className = '',
  heightClassName = 'h-64',
}: TrackingMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<InstanceType<GoogleMapsNs['maps']['Map']> | null>(null)
  const techMarker = useRef<InstanceType<GoogleMapsNs['maps']['Marker']> | null>(null)
  const custMarker = useRef<InstanceType<GoogleMapsNs['maps']['Marker']> | null>(null)
  const lineRef = useRef<InstanceType<GoogleMapsNs['maps']['Polyline']> | null>(null)
  const [mode, setMode] = useState<'loading' | 'maps' | 'fallback'>('loading')

  useEffect(() => {
    let cancelled = false
    void loadGoogleMaps()
      .then((g) => {
        if (cancelled) return
        if (!g || !hostRef.current) {
          setMode('fallback')
          return
        }
        const center = technician || customer || { lat: 0.3476, lng: 32.5825 }
        mapRef.current = new g.maps.Map(hostRef.current, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        setMode('maps')
      })
      .catch(() => {
        if (!cancelled) setMode('fallback')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const g = mapsWindow().google
    if (mode !== 'maps' || !g || !mapRef.current) return

    if (technician) {
      if (!techMarker.current) {
        techMarker.current = new g.maps.Marker({
          map: mapRef.current,
          position: technician,
          title: technician.label || 'Technician',
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#004ac6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        })
      } else {
        techMarker.current.setPosition(technician)
      }
    }

    if (customer) {
      if (!custMarker.current) {
        custMarker.current = new g.maps.Marker({
          map: mapRef.current,
          position: customer,
          title: customer.label || 'Job location',
        })
      } else {
        custMarker.current.setPosition(customer)
      }
    }

    if (route.length > 1) {
      if (!lineRef.current) {
        lineRef.current = new g.maps.Polyline({
          map: mapRef.current,
          path: route,
          strokeColor: '#2563eb',
          strokeOpacity: 0.85,
          strokeWeight: 4,
        })
      } else {
        lineRef.current.setPath(route)
      }
    }

    const bounds = new g.maps.LatLngBounds()
    let has = false
    if (technician) {
      bounds.extend(technician)
      has = true
    }
    if (customer) {
      bounds.extend(customer)
      has = true
    }
    if (has) mapRef.current.fitBounds(bounds)
  }, [mode, technician, customer, route])

  return (
    <div className={`overflow-hidden rounded-2xl border border-border-subtle bg-surface ${className}`}>
      <div ref={hostRef} className={`${heightClassName} w-full ${mode === 'fallback' ? 'hidden' : ''}`} />
      {mode !== 'maps' ? (
        <div className={`${heightClassName} relative flex flex-col justify-between bg-gradient-to-br from-[#002a74] via-[#004ac6] to-[#2563eb] p-5 text-white`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/70">Live map</p>
            <p className="mt-1 text-lg font-semibold">
              {technician ? 'Technician location available' : 'Waiting for technician GPS…'}
            </p>
            {!mapsApiKey() ? (
              <p className="mt-2 text-sm text-white/80">
                Live map view isn’t available right now — status and ETA still update.
              </p>
            ) : mode === 'loading' ? (
              <p className="mt-2 text-sm text-white/80">Loading map…</p>
            ) : (
              <p className="mt-2 text-sm text-white/80">Map unavailable — showing tracking status.</p>
            )}
          </div>
          <div className="grid gap-2 text-sm">
            {technician ? <p>Technician nearby</p> : null}
            <p>Job: {customer?.label || 'Address on file'}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
