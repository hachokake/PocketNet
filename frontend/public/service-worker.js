const CACHE_NAME = "pocketnet-shell-v20";
const CACHE_PREFIX = "pocketnet-shell-";
const OFFLINE_URL = "/static/offline.html";
const APP_SHELL = [
  "/static/app.css?v=pwa-1",
  "/static/app.js?v=pwa-1",
  "/static/pwa.mjs",
  "/static/topology-editor.js",
  "/static/topology-model.mjs",
  "/static/site.webmanifest",
  "/static/offline.html",
  "/static/brand/pocketnet-logo.svg",
  "/static/brand/pocketnet-icon.svg",
  "/static/brand/pocketnet-192.png",
  "/static/brand/pocketnet-512.png",
  "/static/brand/pocketnet-maskable-192.png",
  "/static/brand/pocketnet-maskable-512.png",
  "/static/brand/pocketnet-apple-180.png",
  "/static/index.js",
  "/static/domain/NetworkConnection.js",
  "/static/domain/NetworkDevice.js",
  "/static/domain/NetworkInterface.js",
  "/static/domain/Packet.js",
  "/static/domain/SimulationError.js",
  "/static/domain/SimulationEvent.js",
  "/static/engine/SimulationEngine.js",
  "/static/lab/PeerSwitchLab.js",
  "/static/lab/SimulatedHost.js",
  "/static/lab/ComputerTerminal.js",
  "/static/lab/SwitchTerminal.js",
  "/static/lab/TopologySimulation.js",
  "/static/lab/terminal/output.js",
  "/static/lab/terminal/commands/index.js",
  "/static/lab/terminal/commands/system.js",
  "/static/lab/terminal/commands/network.js",
  "/static/lab/terminal/commands/diagnostics.js",
  "/static/protocols/arp/arp.js",
  "/static/protocols/ethernet/ethernet.js",
  "/static/protocols/ethernet/EthernetSwitch.js",
  "/static/protocols/ethernet/SwitchConfiguration.js",
  "/static/protocols/icmp/icmp.js",
  "/static/protocols/ipv4/address.js",
  "/static/topology/NetworkTopology.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match(OFFLINE_URL);
        return offlinePage || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(request) || Response.error();
      }),
    );
  }
});
