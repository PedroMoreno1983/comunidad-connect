// Service Worker — ComunidadConnect PWA
// Basic caching strategy for offline support

const CACHE_NAME = 'comunidadconnect-v1';
const STATIC_ASSETS = [
    '/',
    '/home',
    '/manifest.json',
    '/favicon.ico',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests (e.g. Supabase API)
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // FOR DEVELOPMENT: BYPASS CACHE ENTIRELY
    event.respondWith(
        fetch(event.request).catch(() => {
            if (event.request.mode === 'navigate') {
                return new Response(
                    '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:16px;background:#0B0F19;color:white"><h1>Sin conexión</h1><p>Revisa tu internet y recarga la aplicación.</p></body></html>',
                    { headers: { 'Content-Type': 'text/html' } }
                );
            }
        })
    );
});
