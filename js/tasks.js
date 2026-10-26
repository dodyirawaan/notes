// Tasks kanban: To do / Doing / Done with priority, due date and tag.
import { load, save, uid, esc, today, fmtDate, onTab } from './store.js';

const $ = id => document.getElementById(id);
export const COLS = [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']];
export const PRIO = { high: 0, medium: 1, low: 2 };
let tasks = load('tasks', []);
const form = $('tk-form');
const persist = () => save('tasks', tasks);

const sorters = {
  due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || PRIO[a.priority] - PRIO[b.priority],
  priority: (a, b) => PRIO[a.priority] - PRIO[b.priority] || (a.due || '9999').localeCompare(b.due || '9999'),
};
const sortSel = $('tk-sort');
sortSel.value = load('tasks.sort', 'due');
sortSel.onchange = () => { save('tasks.sort', sortSel.value); render(); };

function card(t) {
  const overdue = t.status !== 'done' && t.due && t.due < today();
  const i = COLS.findIndex(([k]) => k === t.status);
  return `<article class="task prio-${t.priority}${overdue ? ' overdue' : ''}" draggable="true" data-id="${t.id}">
    <div class="task-title">${esc(t.title)}</div>
    <div class="task-meta"><span class="tag">${esc(t.tag)}</span><span class="prio">${t.priority}</span>${t.due ? `<span>${overdue ? 'Overdue · ' : 'Due '}${fmtDate(t.due, true)}</span>` : ''}</div>
    <div class="row-actions">
      <button type="button" class="small" data-act="left" ${i === 0 ? 'disabled' : ''} aria-label="Move left">←</button>
      <button type="button" class="small" data-act="right" ${i === COLS.length - 1 ? 'disabled' : ''} aria-label="Move right">→</button>
      <button type="button" class="small" data-act="edit">Edit</button>
      <button type="button" class="small danger" data-act="del">Delete</button></div></article>`;
}

function render() {
  const sorted = [...tasks].sort(sorters[sortSel.value]);
  $('tk-board').innerHTML = COLS.map(([k, label]) => {
    const items = sorted.filter(t => t.status === k);
    return `<section class="col" data-status="${k}"><h4>${label} <span class="count">${items.length}</span></h4>${items.map(card).join('') || '<p class="muted small-text">Nothing here</p>'}</section>`;
  }).join('');
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  const i = tasks.findIndex(t => t.id === v.id);
  if (i >= 0) tasks[i] = v; else tasks.push({ ...v, id: uid() });
  persist();
  form.reset();
  form.elements.id.value = '';
  render();
});
$('tk-cancel').onclick = () => { form.reset(); form.elements.id.value = ''; };

const setStatus = (t, s) => { t.status = s; persist(); render(); };
$('tk-board').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const t = tasks.find(x => x.id === b.closest('.task').dataset.id);
  const i = COLS.findIndex(([k]) => k === t.status);
  const act = b.dataset.act;
  if (act === 'left') setStatus(t, COLS[i - 1][0]);
  else if (act === 'right') setStatus(t, COLS[i + 1][0]);
  else if (act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = t[el.name] ?? '';
    form.scrollIntoView({ behavior: 'smooth' });
    form.elements.title.focus();
  } else if (act === 'del' && confirm(`Delete “${t.title}”?`)) {
    tasks = tasks.filter(x => x !== t);
    persist();
    render();
  }
});

// Drag and drop between columns (desktop); the arrow buttons cover touch screens.
$('tk-board').addEventListener('dragstart', e => { const c = e.target.closest('.task'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
$('tk-board').addEventListener('dragover', e => { if (e.target.closest('.col')) e.preventDefault(); });
$('tk-board').addEventListener('drop', e => {
  const col = e.target.closest('.col');
  const t = tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
  if (col && t) { e.preventDefault(); setStatus(t, col.dataset.status); }
});

onTab('tasks', () => { tasks = load('tasks', []); render(); });
render();
