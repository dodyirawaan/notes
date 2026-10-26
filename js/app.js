import { load, save, allData, replaceAll, encrypt, decrypt, download, readFile, photoEntries, photoPut, photoClear, today } from './store.js';
import './dashboard.js';
import './tools.js';
import './report.js';
import './planner.js';
import './timetable.js';
import './tasks.js';
import './milestones.js';
import './venues.js';
import './study.js';
import './lit.js';
import './log.js';

// ---------- Tabs ----------
const tabs = [...document.querySelectorAll('[role=tab]')];
const names = tabs.map(t => t.dataset.tab);

function show(name) {
  if (!names.includes(name)) name = 'dashboard';
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById('tab-' + t.dataset.tab).hidden = !on;
    if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  history.replaceState(null, '', '#' + name);
  document.dispatchEvent(new CustomEvent('tabshown', { detail: name }));
}
tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
document.addEventListener('goto', e => { show(e.detail); scrollTo(0, 0); });
addEventListener('hashchange', () => show(location.hash.slice(1)));

// ---------- Profile ----------
const pf = document.getElementById('profile-form');
const profile = load('profile', {});
for (const el of pf.elements) if (el.name && profile[el.name]) el.value = profile[el.name];
pf.addEventListener('submit', e => {
  e.preventDefault();
  if (!pf.reportValidity()) return;
  const data = Object.fromEntries([...new FormData(pf)].map(([k, v]) => [k, v.trim()]));
  if (save('profile', data)) flash('profile-status', 'Saved in this browser.');
});

export function flash(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.textContent = ''), 3000);
}

// ---------- Full backup / restore (backup is encrypted with the login key) ----------
document.getElementById('backup').addEventListener('click', async () => {
  const photos = Object.fromEntries(await photoEntries());
  const data = allData();
  delete data.notified;
  const box = await encrypt(JSON.stringify({ data, photos }));
  download(`research-desk-backup-${today()}.json`, JSON.stringify({ app: 'research-desk', version: 2, exported: new Date().toISOString(), encrypted: box }));
});

document.getElementById('restore').addEventListener('click', async () => {
  try {
    let b = JSON.parse(await readFile());
    if (b.app !== 'research-desk') throw new Error('This is not a Research Desk backup file.');
    if (b.encrypted) {
      try { b = JSON.parse(await decrypt(b.encrypted)); } catch { throw new Error('This backup was made with a different login.'); }
    }
    if (typeof b.data !== 'object') throw new Error('The backup has no data.');
    if (!confirm('Replace ALL data in this browser with the backup?')) return;
    await replaceAll(b.data);
    await photoClear();
    for (const [id, d] of Object.entries(b.photos || {})) if (typeof d === 'string' && d.startsWith('data:image/')) await photoPut(id, d);
    location.reload();
  } catch (e) { if (e.message !== 'No file chosen') alert('Restore failed: ' + e.message); }
});

// ---------- Offline + storage durability ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.();

show(location.hash.slice(1) || 'dashboard');
