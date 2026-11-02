/*
 * 错题本 PWA Service Worker
 *
 * - 页面导航：始终走网络，断网时返回离线页 /offline.html
 * - /_next/static、/icons：文件名带哈希或基本不变，缓存优先
 * - API 与其他请求不经过缓存，保证数据始终来自服务器
 */
const VERSION = 'v1';
const STATIC_CACHE = `wrong-notebook-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];
/** 静态缓存最多保留的条目数，超出后删除最早写入的 */
const MAX_STATIC_ENTRIES = 300;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('wrong-notebook-') && key !== STATIC_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

function isStaticAsset(url) {
    return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

async function trimCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - MAX_STATIC_ENTRIES;
    for (let i = 0; i < excess; i++) {
        if (!keys[i].url.endsWith(OFFLINE_URL)) await cache.delete(keys[i]);
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
        trimCache(cache);
    }
    return response;
}

async function networkWithOfflineFallback(request) {
    try {
        return await fetch(request);
    } catch (error) {
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkWithOfflineFallback(request));
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
    }
});
