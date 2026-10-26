// Network first, cache as fallback: on site with a weak signal the last
// known state still opens. Writes always go to the network.
const CACHE = 'buildpm-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/api/events') return
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/') || req.mode === 'navigate')) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy))
        }
        return res
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((hit) => hit || Response.error())),
  )
})
