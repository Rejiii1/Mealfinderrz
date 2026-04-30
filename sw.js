// MealFinderrz service worker — caches the app shell so tab-switches are
// instant on iPhone. Bumping VERSION invalidates everything in one shot.
const VERSION = 'mfz-v25';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// HTML pages are stored without query strings; assets carry ?v= and are
// versioned via the cache name above (no need to hardcode ?v= here).
const SHELL = [
    '/',
    '/dishes',
    '/grocery',
    '/family',
    '/styles.css',
    '/app.js',
    '/script.js',
    '/dishes.js',
    '/grocery.js',
    '/manifest.json',
    '/icon-180x180.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
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
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
                        .map((k) => caches.delete(k))
                )
            )
            .then(() => self.clients.claim())
    );
});

// Allow the page to ask the SW to activate a pending update immediately.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Never intercept API calls — the app handles freshness via sessionStorage.
    if (url.pathname.startsWith('/api/')) return;

    // Same-origin only. No third-party CDN (the CSP blocks those anyway).
    if (url.origin !== self.location.origin) return;

    // For navigations, prefer network-first so users see fresh HTML when online,
    // but fall back to the cached shell when offline.
    if (req.mode === 'navigate') {
        event.respondWith(networkFirst(req));
        return;
    }
    event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
            cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
    } catch {
        const cached = await cache.match(req, { ignoreSearch: true });
        return cached || cache.match('/') || new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const networkPromise = fetch(req)
        .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
        })
        .catch(() => null);

    if (cached) {
        // Let the network refresh the cache for next time without blocking.
        networkPromise.catch(() => {});
        return cached;
    }
    const fresh = await networkPromise;
    return fresh || new Response('Offline', { status: 503, statusText: 'Offline' });
}
