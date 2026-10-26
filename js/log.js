// Research log: dated, tagged entries with Markdown export.
import { load, save, uid, esc, download, today, fmtDate } from './store.js';

const $ = id => document.getElementById(id);
let entries = load('log', []);
const form = $('lg-form');
const tagsOf = e => (e.tags || '').split(',').map(t => t.trim()).filter(Boolean);
form.elements.date.value = today();

function filtered() {
  const q = $('lg-q').value.trim().toLowerCase();
  return entries.filter(e => !q || `${e.date} ${e.tags} ${e.text}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

function render() {
  const rows = filtered();
  $('lg-list').innerHTML = rows.map(e => `<article class="log-entry" data-id="${e.id}">
    <header><time datetime="${e.date}">${fmtDate(e.date)}</time>${tagsOf(e).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
    <span class="row-actions"><button type="button" class="small" data-act="edit">Edit</button><button type="button" class="small danger" data-act="del">Delete</button></span></header>
    <p>${esc(e.text).replace(/\n/g, '<br>')}</p></article>`).join('') || '<p class="muted">No entries yet.</p>';
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  const i = entries.findIndex(x => x.id === v.id);
  if (i >= 0) entries[i] = { ...entries[i], ...v };
  else entries.push({ ...v, id: uid(), created: Date.now() });
  save('log', entries);
  form.reset();
  form.elements.id.value = '';
  form.elements.date.value = today();
  render();
});

$('lg-list').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const x = entries.find(y => y.id === b.closest('.log-entry').dataset.id);
  if (b.dataset.act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = x[el.name] ?? '';
    form.scrollIntoView({ behavior: 'smooth' });
    form.elements.text.focus();
  } else if (confirm('Delete this entry?')) {
    entries = entries.filter(y => y !== x);
    save('log', entries);
    render();
  }
});
$('lg-q').addEventListener('input', render);
$('lg-md').onclick = () => {
  const rows = filtered().reverse();
  if (!rows.length) return alert('No entries to export.');
  const md = ['# Research Log', ''];
  for (const e of rows) {
    md.push(`## ${e.date}`, '');
    if (tagsOf(e).length) md.push(`*Tags: ${tagsOf(e).join(', ')}*`, '');
    md.push(e.text, '');
  }
  download(`research-log-${today()}.md`, md.join('\n'), 'text/markdown');
};

render();
