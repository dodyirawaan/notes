// Academic milestones (editable timeline + Gantt bars) and document expiry reminders.
import { load, save, uid, esc, today, fmtDate, monthName, debounce, onTab } from './store.js';
import { daysBetween, isIsoDate } from './calc.js';

const $ = id => document.getElementById(id);
const TEMPLATE = ['Course registration', 'Coursework completed', 'Research proposal', 'Annual evaluation / report submission (year 1)', 'Midterm assessment', 'Annual evaluation / report submission (year 2)', 'Thesis draft to supervisor', 'Thesis submission and review', 'Thesis defence', 'Graduation']
  .map(title => ({ id: uid(), title, start: '', date: '', status: 'planned', progress: 0 }));
const STATUS = ['planned', 'in progress', 'done', 'delayed'];
let ms = load('milestones', TEMPLATE);
let docs = load('documents', ['Passport', 'Residence permit', 'Health insurance', 'Student visa'].map(name => ({ id: uid(), name, expiry: '', notes: '' })));
const persistMs = debounce(() => { save('milestones', ms); gantt(); }, 250);
const persistDocs = debounce(() => save('documents', docs), 250);

function renderMs() {
  $('ms-body').innerHTML = ms.map(m => `<tr data-id="${m.id}">
    <td><input data-f="title" value="${esc(m.title)}" aria-label="Milestone"></td>
    <td><input type="date" data-f="start" value="${esc(m.start)}" aria-label="Start"></td>
    <td><input type="date" data-f="date" value="${esc(m.date)}" aria-label="Due date"></td>
    <td><select data-f="status" aria-label="Status">${STATUS.map(s => `<option${s === m.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><input type="number" min="0" max="100" step="5" data-f="progress" value="${Number(m.progress) || 0}" aria-label="Progress %"></td>
    <td class="row-actions"><button type="button" class="small" data-act="up" aria-label="Move up">↑</button><button type="button" class="small danger" data-act="del" aria-label="Delete">✕</button></td></tr>`).join('');
  gantt();
}

$('ms-body').addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (!f) return;
  const m = ms.find(x => x.id === e.target.closest('tr').dataset.id);
  let v = e.target.value;
  if (f === 'progress') { v = Math.max(0, Math.min(100, Number(v) || 0)); if (v === 100 && m.status !== 'done') { m.status = 'done'; e.target.closest('tr').querySelector('select').value = 'done'; } }
  if (f === 'status' && v === 'done') { m.progress = 100; e.target.closest('tr').querySelector('[data-f=progress]').value = 100; }
  m[f] = v;
  persistMs();
});
$('ms-body').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const i = ms.findIndex(x => x.id === b.closest('tr').dataset.id);
  if (b.dataset.act === 'up' && i > 0) ms.splice(i - 1, 0, ...ms.splice(i, 1));
  else if (b.dataset.act === 'del' && confirm(`Delete “${ms[i].title}”?`)) ms.splice(i, 1);
  else return;
  save('milestones', ms);
  renderMs();
});
$('ms-add').onclick = () => { ms.push({ id: uid(), title: 'New milestone', start: '', date: '', status: 'planned', progress: 0 }); save('milestones', ms); renderMs(); };
$('ms-template').onclick = () => { if (confirm('Replace the list with the default master’s programme template?')) { ms = TEMPLATE.map(m => ({ ...m, id: uid() })); save('milestones', ms); renderMs(); } };
$('ms-sort').onclick = () => { ms.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')); save('milestones', ms); renderMs(); };

function gantt() {
  const items = ms.filter(m => isIsoDate(m.date));
  const box = $('ms-gantt');
  if (!items.length) { box.innerHTML = '<p class="muted">Add due dates to see the timeline.</p>'; return; }
  const starts = items.map(m => isIsoDate(m.start) && m.start < m.date ? m.start : m.date);
  let min = [...starts, today()].sort()[0], max = [...items.map(m => m.date), today()].sort().at(-1);
  min = min.slice(0, 8) + '01';
  const [my, mm] = max.split('-').map(Number);
  max = new Date(Date.UTC(my, mm, 0)).toISOString().slice(0, 10);
  const span = Math.max(1, daysBetween(min, max));
  const pos = d => (daysBetween(min, d) / span) * 100;
  const ticks = [];
  for (let d = new Date(min + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= max; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const every = span > 900 ? 6 : span > 400 ? 3 : 1;
    if (d.getUTCMonth() % every === 0) ticks.push(`<span class="tick" style="left:${pos(iso)}%">${monthName(d.getUTCMonth()).slice(0, 3)} ${String(d.getUTCFullYear()).slice(2)}</span>`);
  }
  box.innerHTML = `<div class="g-axis">${ticks.join('')}</div>` + items.map((m, i) => {
    const s = starts[i], l = pos(s), w = Math.max(pos(m.date) - l, 0.8);
    const late = m.status !== 'done' && m.date < today();
    return `<div class="g-row"><div class="g-label" title="${esc(m.title)}">${esc(m.title)}<small>${fmtDate(m.date, true)} · ${Number(m.progress) || 0}%</small></div>
      <div class="g-track"><span class="g-today" style="left:${pos(today())}%"></span>
      <span class="g-bar st-${m.status.replace(' ', '-')}${late ? ' late' : ''}${s === m.date ? ' point' : ''}" style="left:${l}%;width:${w}%"><i style="width:${Number(m.progress) || 0}%"></i></span></div></div>`;
  }).join('');
}

// ---------- Document expiries ----------
function daysLeft(d) {
  if (!isIsoDate(d.expiry)) return '<span class="muted">set date</span>';
  const n = daysBetween(today(), d.expiry);
  const cls = n < 0 ? 'lv-3' : n <= 30 ? 'lv-3' : n <= 90 ? 'lv-2' : 'lv-0';
  return `<span class="badge ${cls}">${n < 0 ? `expired ${-n} d ago` : `${n} days left`}</span>`;
}
function renderDocs() {
  $('doc-body').innerHTML = docs.map(d => `<tr data-id="${d.id}">
    <td><input data-f="name" value="${esc(d.name)}" aria-label="Document"></td>
    <td><input type="date" data-f="expiry" value="${esc(d.expiry)}" aria-label="Expiry date"></td>
    <td class="left">${daysLeft(d)}</td>
    <td><input data-f="notes" value="${esc(d.notes)}" aria-label="Notes" placeholder="Renewal steps, office…"></td>
    <td><button type="button" class="small danger" data-act="del" aria-label="Delete">✕</button></td></tr>`).join('');
}
$('doc-body').addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (!f) return;
  const tr = e.target.closest('tr'), d = docs.find(x => x.id === tr.dataset.id);
  d[f] = e.target.value;
  if (f === 'expiry') tr.querySelector('.left').innerHTML = daysLeft(d);
  persistDocs();
});
$('doc-body').addEventListener('click', e => {
  if (!e.target.closest('[data-act=del]')) return;
  const id = e.target.closest('tr').dataset.id;
  if (!confirm('Delete this document reminder?')) return;
  docs = docs.filter(x => x.id !== id);
  save('documents', docs);
  renderDocs();
});
$('doc-add').onclick = () => { docs.push({ id: uid(), name: '', expiry: '', notes: '' }); save('documents', docs); renderDocs(); $('doc-body').lastElementChild.querySelector('input').focus(); };

onTab('milestones', () => { renderMs(); renderDocs(); });
renderMs();
renderDocs();
