// Offline support: same-origin files are network-first (so updates arrive), CDN libraries cache-first.
const CACHE = 'research-desk-v12';
const APP = ['./', 'index.html', 'css/style.css', ...['lock', 'app', 'store', 'calc', 'events', 'dashboard', 'tools', 'report', 'planner', 'timetable', 'tasks', 'milestones', 'venues', 'study', 'lit', 'log', 'drive', 'seed', 'seed-activities'].map(f => `js/${f}.js`)];
const CDN = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...APP.map(u => new Request(u, { cache: 'reload' })), ...CDN])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req.url).then(hit => hit || fetch(req)));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
  }
});
