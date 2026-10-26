// Entry point: unlock screen. Email + password → PBKDF2 (600k, SHA-256) → 512 bits.
// The first half is checked against CHECK; the second half is the AES-GCM key for the data vault.
// Neither the email nor the password is stored. After sign-in the key is kept as a non-extractable
// CryptoKey in IndexedDB, so reloads stay unlocked until "Lock" is pressed.
import { openVault, b64e, b64d } from './store.js';

const SALT = 'fR5MUWJr7pg/2l5L8IAywg==';
const CHECK = 'utl4sqdqLCUqvX/r8HU+4DMNnkyYNIdkopFTGxcY8zE=';
const ITER = 600000;
const te = new TextEncoder();
const $ = id => document.getElementById(id);

async function derive(email, password) {
  const material = await crypto.subtle.importKey('raw', te.encode(`${email.trim().toLowerCase()}\n${password}`), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(SALT), iterations: ITER }, material, 512));
  const check = b64e(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(0, 32))));
  return check === CHECK ? bits.slice(32) : null;
}

// ---------- Remembered session key (IndexedDB) ----------
function keyStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('research-desk-session', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('keys', mode);
      const req = fn(t.objectStore('keys'));
      t.oncomplete = () => { r.result.close(); resolve(req?.result); };
      t.onerror = () => reject(t.error);
    };
  });
}
const rememberKey = key => keyStore('readwrite', s => s.put(key, 'vault'));
const recallKey = () => keyStore('readonly', s => s.get('vault'));
const forgetKey = () => keyStore('readwrite', s => s.delete('vault'));

async function start(key) {
  await openVault(key);
  $('lock').hidden = true;
  document.body.classList.remove('locked');
  await import('./app.js');
}

sessionStorage.removeItem('rd.session'); // left over from an older version
$('lock-now').onclick = async () => {
  try { await forgetKey(); } finally { location.reload(); }
};

const form = $('lock-form');
function showForm(msg = '') {
  form.hidden = false;
  $('lock-msg').textContent = msg;
  form.elements.email.focus();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  $('lock-msg').textContent = 'Checking…';
  try {
    const raw = await derive(form.elements.email.value, form.elements.password.value);
    if (!raw) {
      await new Promise(r => setTimeout(r, 1200));
      form.elements.password.value = '';
      return showForm('Email or password is incorrect.');
    }
    form.elements.password.value = '';
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    await rememberKey(key).catch(() => {}); // private windows may refuse; then reloads ask again
    await start(key);
  } catch (err) {
    showForm('Could not open your data: ' + err.message);
  } finally { btn.disabled = false; }
});

if (!window.crypto?.subtle) {
  showForm('This page must be opened over HTTPS (or localhost) to unlock.');
  form.querySelector('button').disabled = true;
} else {
  recallKey().then(key => key ? start(key) : showForm()).catch(() => { forgetKey().catch(() => {}); showForm(); });
}
