// Google Drive sync. Everything is encrypted with the login key before upload, so Drive only ever
// holds an unreadable file (same format as "Export all"). Scope drive.file: the app sees only its own file,
// plus the folder picked with Google Picker, which is where a new vault file is created.
import { load, save, allData, replaceAll, encrypt, decrypt, photoEntries, photoPut, photoClear, debounce, goto, onTab, esc, download } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE = 'research-desk-vault.json';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const LOCAL_ONLY = /^(drive|notified|notifAsked|meta\.)/;
const $ = id => document.getElementById(id);

const conf = () => load('drive', {});
const setConf = patch => save('drive', { ...conf(), ...patch });
let token = null, tokenExp = 0, tokenClient = null, pending = null, gsi = null, picker = null, busy = false;

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

function loadScript(src, done) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, async: true });
    s.onload = () => done(resolve, reject);
    s.onerror = () => { s.remove(); reject(new Error('Cannot reach Google. Is your VPN on?')); };
    document.head.append(s);
  });
}
const loadPicker = () => (picker ||= loadScript('https://apis.google.com/js/api.js', (ok, fail) => gapi.load('picker', { callback: ok, onerror: () => fail(new Error('Google Picker failed to load.')) })).catch(e => { picker = null; throw e; }));

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
  const { folderId } = conf();
  const meta = fileId ? {} : { name: FILE, mimeType: 'application/json', ...(folderId && { parents: [folderId] }) };
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

// The app may only write into a folder the user picked here (drive.file), so the folder comes from Google Picker.
function pick(view, multi = false) {
  return new Promise(resolve => {
    const b = new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setAppId(conf().clientId.split('-')[0])
      .setCallback(d => { if (d.action === google.picker.Action.PICKED) resolve(d.docs); else if (d.action === google.picker.Action.CANCEL) resolve([]); });
    if (multi) b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}

async function chooseFolder() {
  await loadPicker();
  const [folder] = await pick(new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder').setQuery('notes'));
  if (!folder) return status('No folder chosen. Nothing was changed.');
  setConf({ folderId: folder.id, folderName: folder.name });
  showFolder();
  const f = await findFile();
  if (f) { // move the existing vault file into the folder
    const { parents = [] } = await (await api(`${API}/files/${f.id}?fields=parents`)).json();
    const moved = await (await api(`${API}/files/${f.id}?addParents=${folder.id}&removeParents=${parents.filter(p => p !== folder.id).join(',')}&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    if (f.modifiedTime === conf().remoteModified) setConf({ remoteModified: moved.modifiedTime });
    status(`Moved ${FILE} into “${folder.name}”. ${describe()}`);
  } else status(`Data will be saved in “${folder.name}” on the next sync. ${describe()}`);
  await listFiles();
}

// ---------- Files in the chosen folder (stored as-is, not encrypted) ----------
let files = [];
const fileStatus = msg => { $('gd-files-status').textContent = msg; };
const needFolder = () => { if (!conf().folderId) throw new Error('Choose the Drive folder first (“Choose folder…” above).'); };
const fmtSize = n => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const isGoogleDoc = f => f.mimeType.startsWith('application/vnd.google-apps.');

async function listFiles() {
  needFolder();
  fileStatus('Loading…');
  const q = encodeURIComponent(`'${conf().folderId}' in parents and trashed=false and name != '${FILE}'`);
  files = [];
  let page = '';
  do {
    const r = await (await api(`${API}/files?q=${q}&orderBy=folder,name&pageSize=200&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)${page && `&pageToken=${page}`}`)).json();
    files.push(...r.files);
    page = r.nextPageToken || '';
  } while (page);
  renderFiles();
}

function renderFiles() {
  $('gd-files').innerHTML = files.map(f => `<tr data-id="${f.id}"><td>${f.mimeType.endsWith('.folder') ? '📁 ' : ''}${esc(f.name)}</td><td>${fmtSize(f.size && Number(f.size))}</td><td>${new Date(f.modifiedTime).toLocaleString()}</td>
    <td class="row-actions">${f.mimeType.endsWith('.folder') ? '' : `<button type="button" class="small" data-act="get">Download${isGoogleDoc(f) ? ' (PDF)' : ''}</button>`}<a class="btn small" href="${esc(f.webViewLink)}" target="_blank" rel="noopener">Open</a><button type="button" class="small danger" data-act="del">Delete</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">No files here yet. Upload some, or add files already in the folder.</td></tr>';
  fileStatus(`${files.length} item${files.length === 1 ? '' : 's'} in “${conf().folderName}”.`);
}

async function uploadFiles(list) {
  needFolder();
  let i = 0;
  for (const file of list) {
    fileStatus(`Uploading ${++i}/${list.length}: ${file.name}…`);
    const type = file.type || 'application/octet-stream';
    const init = await api(`${UP}/files?uploadType=resumable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type },
      body: JSON.stringify({ name: file.name, parents: [conf().folderId] }),
    });
    const r = await fetch(init.headers.get('Location'), { method: 'PUT', headers: { 'Content-Type': type }, body: file });
    if (!r.ok) throw new Error(`Upload of ${file.name} failed (${r.status}).`);
  }
  await listFiles();
}

async function downloadFile(f) {
  fileStatus(`Downloading ${f.name}…`);
  const doc = isGoogleDoc(f);
  const blob = await (await api(doc ? `${API}/files/${f.id}/export?mimeType=application/pdf` : `${API}/files/${f.id}?alt=media`)).blob();
  download(doc ? `${f.name}.pdf` : f.name, blob);
  renderFiles();
}

async function addExisting() {
  needFolder();
  await loadPicker();
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setParent(conf().folderId).setIncludeFolders(true);
  if ((await pick(view, true)).length) await listFiles();
}
const showFolder = () => { $('gd-folder').textContent = conf().folderName ? `“${conf().folderName}”` : 'My Drive (top level)'; };

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
function setButtons(disabled) { for (const id of ['gd-connect', 'gd-sync', 'gd-up', 'gd-down', 'gd-quick', 'gd-folder-btn', 'gd-refresh', 'gd-upload', 'gd-add']) $(id).disabled = disabled; }

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
$('gd-folder-btn').onclick = () => run(chooseFolder);
$('gd-connect').onclick = () => run(async () => status(`Connected to Google Drive. ${describe()}`));
$('gd-sync').onclick = () => run(syncNow);
$('gd-quick').onclick = () => conf().clientId ? run(syncNow) : goto('sync');
$('gd-up').onclick = () => { if (confirm('Overwrite the Google Drive copy with this device’s data?')) run(push); };
$('gd-down').onclick = () => {
  if (!confirm('Replace ALL data on this device with the Google Drive copy?')) return;
  run(async () => { const r = await findFile(); if (!r) throw new Error('No Research Desk file found in your Google Drive yet.'); await pull(r); });
};

$('gd-refresh').onclick = () => run(listFiles);
$('gd-add').onclick = () => run(addExisting);
$('gd-upload').onclick = () => {
  const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true });
  input.onchange = () => input.files.length && run(() => uploadFiles([...input.files]));
  input.click();
};
$('gd-files').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const f = files.find(x => x.id === b.closest('tr').dataset.id);
  if (b.dataset.act === 'get') run(() => downloadFile(f));
  else if (confirm(`Move “${f.name}” to the Google Drive trash?`)) run(async () => { await api(`${API}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"trashed":true}' }); await listFiles(); });
});

onTab('sync', () => {
  status(describe());
  if (conf().folderId && token && Date.now() < tokenExp - 60000 && !busy) run(listFiles);
});
showFolder();
if (conf().clientId) loadGsi().catch(() => {});
status(describe());
