// MealFinderrz service worker — caches the app shell so tab-switches are instant on iPhone.
const VERSION = 'mfz-v23';
const SHELL = [
    '/',
    '/dishes',
    '/grocery',
    '/family',
    '/styles.css?v=23',
    '/app.js?v=23',
    '/script.js?v=23',
    '/dishes.js?v=23',
    '/grocery.js?v=23',
    '/manifest.json',
    '/icon-180x180.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION).then((cache) =>
            // Best-effort precache; missing entries shouldn't block install.
            Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Never intercept API calls — the app handles freshness via sessionStorage.
    if (url.pathname.startsWith('/api/')) return;

    // Only handle same-origin and the FontAwesome CDN.
    const sameOrigin = url.origin === self.location.origin;
    const isFontAwesome = url.hostname === 'cdnjs.cloudflare.com';
    if (!sameOrigin && !isFontAwesome) return;

    event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const networkPromise = fetch(req)
        .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
                cache.put(req, res.clone()).catch(() => {});
            }
            return res;
        })
        .catch(() => null);

    if (cached) {
        // Don't await — let the network refresh the cache for next time.
        networkPromise;
        return cached;
    }
    const fresh = await networkPromise;
    return fresh || new Response('Offline', { status: 503, statusText: 'Offline' });
}
