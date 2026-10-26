// Google Drive sync. Everything is encrypted with the login key before upload, so Drive only ever
// holds an unreadable file (same format as "Export all"). Scope drive.file: the app sees only its own file.
import { load, save, allData, replaceAll, encrypt, decrypt, photoEntries, photoPut, photoClear, debounce, goto, onTab } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE = 'research-desk-vault.json';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const LOCAL_ONLY = /^(drive|notified|notifAsked|meta\.)/;
const $ = id => document.getElementById(id);

const conf = () => load('drive', {});
const setConf = patch => save('drive', { ...conf(), ...patch });
let token = null, tokenExp = 0, tokenClient = null, pending = null, gsi = null, busy = false;

function status(msg, error = false) {
  const el = $('gd-status');
  el.textContent = msg;
  el.classList.toggle('error-text', error);
}
function describe() {
  const d = conf();
  if (!d.clientId) return 'Not set up yet: paste your OAuth Client ID above.';
  const last = d.syncedAt ? `Last sync ${new Date(d.syncedAt).toLocaleString()}` : 'Never synced on this device';
  const changed = load('meta.changedAt', 0) > (d.syncedAt || 0) ? ' · local changes not yet uploaded' : '';
  return `${token && Date.now() < tokenExp ? 'Connected' : 'Not connected'} · ${last}${changed}`;
}

function loadGsi() {
  return gsi ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = resolve;
    s.onerror = () => { gsi = null; s.remove(); reject(new Error('Cannot reach Google. Is your VPN on?')); };
    document.head.append(s);
  });
}

// Must run straight from a click (no await before it) so the browser allows the sign-in popup.
function getToken() {
  if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
  const cid = conf().clientId;
  if (!cid) return Promise.reject(new Error('Paste your OAuth Client ID first.'));
  if (!window.google?.accounts?.oauth2) { loadGsi().catch(() => {}); return Promise.reject(new Error('Google sign-in is still loading (VPN on?). Try again in a moment.')); }
  if (!tokenClient || tokenClient.cid !== cid) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cid, scope: SCOPE,
      callback: r => {
        if (r.error || !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return pending?.reject(new Error(r.error_description || 'Drive access was not granted.'));
        token = r.access_token;
        tokenExp = Date.now() + Number(r.expires_in) * 1000;
        if (!conf().consented) setConf({ consented: true });
        pending?.resolve(token);
      },
      error_callback: e => pending?.reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed.' : e.type === 'popup_failed_to_open' ? 'Popup blocked: allow popups for this site.' : e.message || e.type)),
    });
    tokenClient.cid = cid;
  }
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: conf().consented ? '' : 'consent' });
  });
}

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });
  if (r.status === 401) { token = null; throw new Error('Google session expired. Click again to reconnect.'); }
  if (!r.ok) throw new Error(`Google Drive error ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r;
}

async function findFile() {
  const { fileId } = conf();
  if (fileId) {
    const r = await fetch(`${API}/files/${fileId}?fields=id,modifiedTime,trashed`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const f = await r.json(); if (!f.trashed) return f; }
    else if (r.status !== 404) await api(`${API}/files/${fileId}?fields=id`); // surfaces the real error
  }
  const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
  const { files } = await (await api(`${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`)).json();
  if (files[0]) setConf({ fileId: files[0].id });
  return files[0] || null;
}

async function snapshot() {
  const data = Object.fromEntries(Object.entries(allData()).filter(([k]) => !LOCAL_ONLY.test(k)));
  const photos = Object.fromEntries(await photoEntries());
  return JSON.stringify({ app: 'research-desk', version: 2, exported: new Date().toISOString(), encrypted: await encrypt(JSON.stringify({ data, photos })) });
}

async function upload(text) {
  const { fileId } = conf();
  const meta = fileId ? {} : { name: FILE, mimeType: 'application/json' };
  const init = await api(fileId ? `${UP}/files/${fileId}?uploadType=resumable` : `${UP}/files?uploadType=resumable`, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const session = init.headers.get('Location');
  let res;
  if (session) {
    res = await fetch(session, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text });
    if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
  } else { // fallback: multipart (fine up to 5 MB)
    const b = 'rd' + Math.random().toString(36).slice(2);
    res = await api(fileId ? `${UP}/files/${fileId}?uploadType=multipart` : `${UP}/files?uploadType=multipart`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${b}--`,
    });
  }
  const { id } = await res.json();
  return (await api(`${API}/files/${id}?fields=id,modifiedTime`)).json();
}

async function push() {
  status('Encrypting and uploading…');
  const f = await upload(await snapshot());
  setConf({ fileId: f.id, remoteModified: f.modifiedTime, syncedAt: Date.now() });
  status(`Uploaded to Google Drive. ${describe()}`);
}

async function pull(remote) {
  status('Downloading…');
  const b = JSON.parse(await (await api(`${API}/files/${remote.id}?alt=media`)).text());
  let inner;
  try { inner = JSON.parse(await decrypt(b.encrypted)); } catch { throw new Error('The Drive file was made with a different login and cannot be opened.'); }
  const keep = Object.fromEntries(Object.entries(allData()).filter(([k]) => /^(drive|notifAsked)$/.test(k)));
  await replaceAll({ ...inner.data, ...keep, drive: { ...conf(), fileId: remote.id, remoteModified: remote.modifiedTime, syncedAt: Date.now() } });
  await photoClear();
  for (const [id, d] of Object.entries(inner.photos || {})) if (typeof d === 'string' && d.startsWith('data:image/')) await photoPut(id, d);
  alert('Data downloaded from Google Drive. The page will reload; sign in again.');
  location.reload();
}

async function run(job) {
  if (busy) return;
  busy = true;
  setButtons(true);
  try { await getToken(); await job(); }
  catch (e) { status(e.message, true); }
  finally { busy = false; setButtons(false); }
}
function setButtons(disabled) { for (const id of ['gd-connect', 'gd-sync', 'gd-up', 'gd-down', 'gd-quick']) $(id).disabled = disabled; }

async function syncNow() {
  status('Checking Google Drive…');
  const remote = await findFile();
  const d = conf();
  const localChanged = load('meta.changedAt', 0) > (d.syncedAt || 0);
  if (!remote) return push();
  const remoteChanged = remote.modifiedTime !== d.remoteModified;
  if (!remoteChanged && !localChanged) return status(`Already up to date. ${describe()}`);
  if (!remoteChanged) return push();
  if (!localChanged) return pull(remote);
  if (confirm('Both this device and Google Drive have changes.\n\nOK = use the Google Drive version (replaces data on this device).\nCancel = more options.')) return pull(remote);
  if (confirm('Upload this device’s data and overwrite the Google Drive version?')) return push();
  status('Sync cancelled. Nothing was changed.');
}

// Background upload while connected: only when Drive has not changed elsewhere, never with a popup.
const autoPush = debounce(async () => {
  if (busy || !token || Date.now() > tokenExp - 60000 || !conf().clientId) return;
  busy = true;
  try {
    const remote = await findFile();
    if (remote && remote.modifiedTime !== conf().remoteModified) status('Google Drive has newer changes from another device. Click “Sync now”.', true);
    else await push();
  } catch (e) { status(e.message, true); }
  finally { busy = false; }
}, 20000);
document.addEventListener('datachanged', autoPush);

// ---------- UI ----------
const cidInput = $('gd-client');
cidInput.value = conf().clientId || '';
cidInput.addEventListener('change', () => {
  const v = cidInput.value.trim();
  if (v && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) { status('That does not look like a Client ID (…apps.googleusercontent.com).', true); return; }
  setConf({ clientId: v, consented: false });
  token = null;
  if (v) loadGsi().then(() => status(describe()), e => status(e.message, true));
  else status(describe());
});
$('gd-connect').onclick = () => run(async () => status(`Connected to Google Drive. ${describe()}`));
$('gd-sync').onclick = () => run(syncNow);
$('gd-quick').onclick = () => conf().clientId ? run(syncNow) : goto('sync');
$('gd-up').onclick = () => { if (confirm('Overwrite the Google Drive copy with this device’s data?')) run(push); };
$('gd-down').onclick = () => {
  if (!confirm('Replace ALL data on this device with the Google Drive copy?')) return;
  run(async () => { const r = await findFile(); if (!r) throw new Error('No Research Desk file found in your Google Drive yet.'); await pull(r); });
};

onTab('sync', () => status(describe()));
if (conf().clientId) loadGsi().catch(() => {});
status(describe());
