// Browser-only persistence: localStorage for records, IndexedDB for photos (too big for localStorage).
const PREFIX = 'rd.';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? structuredClone(fallback) : JSON.parse(v);
  } catch { return structuredClone(fallback); }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch (e) { alert(`Could not save (${e.name}). Browser storage may be full or disabled.`); return false; }
}

export function allData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
  }
  return out;
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

// ---------- Photos (IndexedDB) ----------
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
export const photoPut = (id, data) => tx('readwrite', s => s.put(data, id));
export const photoDel = id => tx('readwrite', s => s.delete(id));
export const photoClear = () => tx('readwrite', s => s.clear());
export async function photoEntries() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('photos');
    const s = t.objectStore('photos');
    const k = s.getAllKeys(), v = s.getAll();
    t.oncomplete = () => resolve(k.result.map((id, i) => [id, v.result[i]]));
    t.onerror = () => reject(t.error);
  });
}
