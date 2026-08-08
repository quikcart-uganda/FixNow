/* FixNow minimal service worker — shell cache + network-first for navigations. */
const CACHE = 'fixnow-shell-v2'
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/brand/fixnow-mark.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/notification-badge-96.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never cache API or socket traffic.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && (url.origin === self.location.origin)) {
            const copy = res.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})

/** Web Push (VAPID) — used when VITE_FCM_VAPID_KEY is configured. */
self.addEventListener('push', (event) => {
  let title = 'FixNow'
  let body = 'You have a new notification'
  let data = {}
  try {
    const payload = event.data ? event.data.json() : null
    if (payload && typeof payload === 'object') {
      title = payload.title || title
      body = payload.body || body
      data = payload.data || payload
    } else if (event.data) {
      body = event.data.text()
    }
  } catch {
    if (event.data) body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/notification-badge-96.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    }),
  )
})
