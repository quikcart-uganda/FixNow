import { StrictMode, Suspense, lazy, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, PushProvider, SocketProvider } from '@fixnow/hooks'
import { AppSplashGate, AppErrorBoundary } from '@fixnow/shared'
import { tokenStorage } from '@fixnow/api'
import {
  NativeShellHost,
  OfflineBanner,
  OfflineQueueHost,
  NativeErrorHost,
  bootstrapNative,
} from '@fixnow/native'
import { initFrontendMonitoring } from '../packages/shared/monitoring'
import { injectMaterialSymbolsFont, ensureMaterialSymbolsFont } from '@fixnow/ui'
/** Keep package CSS for class defaults; font src is overridden by injectMaterialSymbolsFont. */
import 'material-symbols/outlined.css'
import './index.css'
import '../packages/shared/splash/fixnowSplash.css'

// Register icon font before React paints portal chrome.
injectMaterialSymbolsFont()
void ensureMaterialSymbolsFont()

// App (portal router) is a separate chunk so splash CSS + native bootstrap paint first.
const App = lazy(() => import('./App.tsx'))

function clearBootLock() {
  document.documentElement.classList.remove('fixnow-splash-boot')
  document.body?.classList.remove('fixnow-splash-boot')
  document.documentElement.style.background = ''
  if (document.body) document.body.style.background = ''
  const boot = document.getElementById('fixnow-boot-splash')
  if (boot) {
    boot.classList.add('is-leaving')
    window.setTimeout(() => boot.remove(), 420)
  }
}

function BootFallback() {
  // Brand-matched fallback — never a white/blue void under the splash boot lock.
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      style={{ background: 'linear-gradient(145deg, #002a74 0%, #004ac6 44%, #2563eb 82%)' }}
      role="status"
      aria-label="Starting FixNow"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-white opacity-80" />
    </div>
  )
}

function BootFailure({ detail }: { detail?: string }) {
  const [busy, setBusy] = useState(false)

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center text-white"
      style={{ background: 'linear-gradient(145deg, #002a74 0%, #004ac6 44%, #2563eb 82%)' }}
      role="alert"
    >
      <div
        className="grid h-[72px] w-[72px] place-items-center rounded-[20px] border border-white/30 bg-[#004ac6] shadow-lg"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#ffffff"
            d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
          />
        </svg>
      </div>
      <div className="text-[42px] font-extrabold leading-none tracking-tight">
        <span>Fix</span>
        <span style={{ color: '#ffcc00' }}>Now</span>
      </div>
      <h1 className="text-xl font-semibold">Couldn’t start FixNow</h1>
      <p className="max-w-md text-[15px] font-medium leading-relaxed text-white/85">
        Something went wrong while opening the app. Your account and saved information are safe.
        {detail ? (
          <>
            <br />
            <span className="mt-2 block text-xs font-normal text-white/60">{detail}</span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        className="interactive-control tap-target inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#004ac6] shadow-md disabled:cursor-wait disabled:opacity-70"
        disabled={busy}
        aria-busy={busy ? 'true' : undefined}
        onClick={() => {
          if (busy) return
          setBusy(true)
          requestAnimationFrame(() => {
            try {
              window.location.reload()
            } catch {
              setBusy(false)
            }
            window.setTimeout(() => setBusy(false), 5000)
          })
        }}
      >
        {busy ? (
          <>
            <span
              className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#004ac6]/30 border-t-[#004ac6]"
              aria-hidden="true"
            />
            <span>Trying…</span>
          </>
        ) : (
          'Try again'
        )}
      </button>
    </main>
  )
}

function mountFailure(error: unknown) {
  clearBootLock()
  const detail =
    error instanceof Error
      ? error.message.slice(0, 180)
      : typeof error === 'string'
        ? error.slice(0, 180)
        : undefined
  const rootElement = document.getElementById('root')
  if (rootElement) {
    try {
      createRoot(rootElement).render(<BootFailure detail={detail} />)
      return
    } catch {
      /* fall through to static HTML recovery */
    }
  }
  // Last resort: static recovery if React itself cannot mount.
  document.body.innerHTML = `
    <main style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;color:#fff;background:linear-gradient(145deg,#002a74 0%,#004ac6 44%,#2563eb 82%);font-family:Inter,system-ui,sans-serif">
      <h1 style="margin:0;font-size:22px;font-weight:700">Couldn’t start FixNow</h1>
      <p style="margin:0;max-width:28rem;opacity:.85">Check your connection and try again.</p>
      <button type="button" style="border:0;border-radius:12px;background:#fff;color:#004ac6;font-weight:700;padding:12px 22px" onclick="location.reload()">Try again</button>
    </main>
  `
}

async function start() {
  const rootElement = document.getElementById('root')
  if (!rootElement) return
  // Prefer icon font ready before first portal paint (avoids fallback flash).
  await Promise.race([ensureMaterialSymbolsFont(), new Promise((r) => setTimeout(r, 1200))])
  try {
    await initFrontendMonitoring()
  } catch {
    /* monitoring must never block startup */
  }
  try {
    await bootstrapNative(tokenStorage)
  } catch (error) {
    console.error('[FixNow] Native bootstrap failed', error)
  }

  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <PushProvider>
                <AppSplashGate>
                  <OfflineBanner />
                  <OfflineQueueHost />
                  <NativeErrorHost />
                  <NativeShellHost />
                  <Suspense fallback={<BootFallback />}>
                    <App />
                  </Suspense>
                </AppSplashGate>
              </PushProvider>
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void start().catch((error: unknown) => {
  console.error('[FixNow] Startup failed', error)
  mountFailure(error)
})
