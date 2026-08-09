const CACHE_NAME = "food-calculator-v26-platform-shell-fix1";

const FILES_TO_CACHE = [
    "/",
    "/index.html",
    "/style.css",
    "/script.js",
    "/platform.js",
    "/login.html",
    "/login.js",
    "/navigation.js",
    "/recipeInstructions.html",
    "/recipeInstructions.js",
    "/recipeDetails.html",
    "/recipeDetails.js",
    "/recipeCreate.html",
    "/recipeCreate.js",
    "/admin.html",
    "/adminTable.html",
    "/admin.js",
    "/inventory.html",
    "/inventory.js",
    "/manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    const isAppShellAsset =
        event.request.mode === "navigate" ||
        ["script", "style"].includes(event.request.destination);

    if (url.origin === self.location.origin && isAppShellAsset) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
