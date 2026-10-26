// Conference & journal tracker; deadlines appear in the calendar automatically (see events.js).
import { load, save, uid, esc, fmtDate, today } from './store.js';
import { daysBetween, isIsoDate } from './calc.js';

const $ = id => document.getElementById(id);
let venues = load('venues', []);
const form = $('vn-form');

function left(d) {
  if (!isIsoDate(d)) return '<span class="muted">—</span>';
  const n = daysBetween(today(), d);
  const cls = n < 0 ? 'muted' : n <= 14 ? 'badge lv-3' : n <= 45 ? 'badge lv-2' : 'badge lv-0';
  return `${fmtDate(d, true)} <span class="${cls}">${n < 0 ? 'passed' : n === 0 ? 'today' : `${n} d`}</span>`;
}
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '';

function render() {
  const next = v => [v.abstractDeadline, v.paperDeadline].filter(d => isIsoDate(d) && d >= today()).sort()[0] || '9999';
  const rows = [...venues].sort((a, b) => next(a).localeCompare(next(b)));
  $('vn-body').innerHTML = rows.map(v => `<tr data-id="${v.id}">
    <td><b>${safeUrl(v.url) ? `<a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.name)}</a>` : esc(v.name)}</b><br><small class="muted">${esc(v.kind)}${v.notes ? ` · ${esc(v.notes)}` : ''}</small></td>
    <td>${left(v.abstractDeadline)}</td><td>${left(v.paperDeadline)}</td><td>${esc(v.status)}</td>
    <td class="row-actions"><button type="button" class="small" data-act="edit">Edit</button><button type="button" class="small danger" data-act="del">Delete</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="muted">No conferences or journals yet.</td></tr>';
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  if (v.url && !safeUrl(v.url)) return alert('The URL must start with http:// or https://');
  if (v.kind === 'conference' && v.abstractDeadline && v.paperDeadline && v.paperDeadline < v.abstractDeadline && !confirm('The full-paper deadline is before the abstract deadline. Save anyway?')) return;
  const i = venues.findIndex(x => x.id === v.id);
  if (i >= 0) venues[i] = v; else venues.push({ ...v, id: uid() });
  save('venues', venues);
  form.reset();
  form.elements.id.value = '';
  render();
});
$('vn-cancel').onclick = () => { form.reset(); form.elements.id.value = ''; };

$('vn-body').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const v = venues.find(x => x.id === b.closest('tr').dataset.id);
  if (b.dataset.act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = v[el.name] ?? '';
    form.scrollIntoView({ behavior: 'smooth' });
  } else if (confirm(`Delete “${v.name}”? Its deadlines leave the calendar too.`)) {
    venues = venues.filter(x => x !== v);
    save('venues', venues);
    render();
  }
});

render();
