const CACHE_NAME = "food-moment-platform-v50-shopping-share";

const FILES_TO_CACHE = [
    "/",
    "/index.html",
    "/style.css",
    "/home.js",
    "/product-tour.js",
    "/foodMoments.html",
    "/foodMoments.js",
    "/foodMomentCreate.html",
    "/foodMomentCreate.js",
    "/foodMoment.html",
    "/foodMoment.js",
    "/recipes.html",
    "/mealPlan.html",
    "/script.js",
    "/auth-shell.js",
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
    "/shopping.html",
    "/shopping.js",
    "/wallet.html",
    "/wallet.js",
    "/assets/entry-illustrations/recipes.png",
    "/assets/entry-illustrations/moment.png",
    "/assets/entry-illustrations/capture.png",
    "/assets/entry-illustrations/planning.png",
    "/assets/entry-illustrations/shopping.png",
    "/assets/entry-illustrations/ideas.png",
    "/favicon.ico",
    "/favicon-32.png",
    "/favicon-64.png",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
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
