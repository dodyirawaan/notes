// Browser-only persistence, encrypted at rest with AES-GCM (key comes from the login, see lock.js).
// Records live in one encrypted localStorage "vault"; photos are encrypted one by one in IndexedDB.
const PREFIX = 'rd.';
const VAULT = PREFIX + 'vault';
let cache = {};
let aesKey = null;

const te = new TextEncoder(), td = new TextDecoder();
export function b64e(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function encrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, te.encode(text)));
  return { iv: b64e(iv), ct: b64e(ct) };
}
export async function decrypt({ iv, ct }) {
  return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, aesKey, b64d(ct)));
}

async function flush() {
  try { localStorage.setItem(VAULT, JSON.stringify(await encrypt(JSON.stringify(cache)))); }
  catch (e) { alert(`Could not save (${e.name}). Browser storage may be full or disabled.`); }
}
// Coalesces saves: at most one encryption runs at a time and the last state always gets written.
let writing = null, dirty = false;
function persist() {
  dirty = true;
  writing ||= (async () => { while (dirty) { dirty = false; await flush(); } writing = null; })();
  return writing;
}

export async function openVault(key) {
  aesKey = key;
  const raw = localStorage.getItem(VAULT);
  cache = raw ? JSON.parse(await decrypt(JSON.parse(raw))) : {};
  // Records saved before the lock existed are plaintext: move them into the vault, then delete them.
  const legacy = Object.keys(localStorage).filter(k => k.startsWith(PREFIX) && k !== VAULT);
  if (legacy.length) {
    for (const k of legacy) { try { cache[k.slice(PREFIX.length)] ??= JSON.parse(localStorage.getItem(k)); } catch { /* skip corrupt */ } }
    await flush();
    legacy.forEach(k => localStorage.removeItem(k));
  }
}

export const load = (key, fallback) => structuredClone(key in cache ? cache[key] : fallback);

// UI preferences and sync bookkeeping do not count as changes worth syncing.
const UNTRACKED = /^(drive|notified|notifAsked|meta\.|calc\.|planner\.view|tasks\.sort|lit\.view)/;

export function save(key, value) {
  cache[key] = structuredClone(value);
  if (!UNTRACKED.test(key)) {
    cache['meta.changedAt'] = Date.now();
    document.dispatchEvent(new Event('datachanged'));
  }
  persist();
  return true;
}

export const allData = () => structuredClone(cache);
export function replaceAll(data) {
  cache = structuredClone(data);
  return persist();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function today() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(iso, short = false) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const mon = short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1];
  return `${d} ${mon} ${y}`;
}
export const monthName = m => MONTHS[m];

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFile(accept = '.json,application/json') {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return reject(new Error('No file chosen'));
      f.text().then(resolve, reject);
    };
    input.click();
  });
}

export function csv(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

export const goto = tab => document.dispatchEvent(new CustomEvent('goto', { detail: tab }));
export const onTab = (name, fn) => document.addEventListener('tabshown', e => { if (e.detail === name) fn(); });

// ---------- Photos (IndexedDB, encrypted) ----------
let dbp;
function db() {
  return dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('research-desk', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('photos', mode);
    const req = fn(t.objectStore('photos'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}
export async function photoPut(id, data) {
  const box = await encrypt(data);
  return tx('readwrite', s => s.put(box, id));
}
export const photoDel = id => tx('readwrite', s => s.delete(id));
export const photoClear = () => tx('readwrite', s => s.clear());
export async function photoEntries() {
  const d = await db();
  const rows = await new Promise((resolve, reject) => {
    const t = d.transaction('photos');
    const s = t.objectStore('photos');
    const k = s.getAllKeys(), v = s.getAll();
    t.oncomplete = () => resolve(k.result.map((id, i) => [id, v.result[i]]));
    t.onerror = () => reject(t.error);
  });
  const out = [];
  for (const [id, v] of rows) {
    if (typeof v === 'string') { out.push([id, v]); await photoPut(id, v); continue; } // legacy plaintext → encrypt
    try { out.push([id, await decrypt(v)]); } catch { /* unreadable with this key */ }
  }
  return out;
}
