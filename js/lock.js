// Entry point: unlock screen. Email + password → PBKDF2 (600k, SHA-256) → 512 bits.
// The first half is checked against CHECK; the second half is the AES-GCM key for the data vault.
// Neither the email nor the password is stored anywhere.
import { openVault, b64e, b64d } from './store.js';

const SALT = 'fR5MUWJr7pg/2l5L8IAywg==';
const CHECK = 'utl4sqdqLCUqvX/r8HU+4DMNnkyYNIdkopFTGxcY8zE=';
const ITER = 600000;
const SESSION = 'rd.session';
const te = new TextEncoder();
const $ = id => document.getElementById(id);

async function derive(email, password) {
  const material = await crypto.subtle.importKey('raw', te.encode(`${email.trim().toLowerCase()}\n${password}`), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(SALT), iterations: ITER }, material, 512));
  const check = b64e(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(0, 32))));
  return check === CHECK ? bits.slice(32) : null;
}

async function start(raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  await openVault(key);
  $('lock').hidden = true;
  document.body.classList.remove('locked');
  await import('./app.js');
}

// Every page load starts locked; clear the session key older versions kept.
sessionStorage.removeItem(SESSION);
$('lock-now').onclick = () => location.reload();

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
    await start(raw);
  } catch (err) {
    showForm('Could not open your data: ' + err.message);
  } finally { btn.disabled = false; }
});

if (!window.crypto?.subtle) {
  showForm('This page must be opened over HTTPS (or localhost) to unlock.');
  form.querySelector('button').disabled = true;
} else {
  showForm();
}
