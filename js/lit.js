// Literature tracker with matrix view, BibTeX/CSV export and a review-paper outline builder.
import { load, save, uid, esc, download, csv, today, debounce } from './store.js';

const $ = id => document.getElementById(id);
let papers = load('lit.papers', []);
const form = $('lt-form');
const STATUS = ['to read', 'reading', 'read', 'cited'];
const tagsOf = p => (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
const surname = a => (a || '').split(';')[0].split(',')[0].trim().split(/\s+/).at(-1) || 'Anon';
let view = load('lit.view', 'list');

function filtered() {
  const q = $('lt-q').value.trim().toLowerCase(), st = $('lt-status').value, tag = $('lt-tag').value;
  return papers.filter(p => (!st || p.status === st) && (!tag || tagsOf(p).includes(tag))
    && (!q || Object.values(p).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
}

function render() {
  const tags = [...new Set(papers.flatMap(tagsOf))].sort();
  const cur = $('lt-tag').value;
  $('lt-tag').innerHTML = '<option value="">All tags</option>' + tags.map(t => `<option${t === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
  $('lt-list').setAttribute('aria-pressed', view === 'list');
  $('lt-matrix').setAttribute('aria-pressed', view === 'matrix');
  const rows = filtered();
  $('lt-count').textContent = `${rows.length} of ${papers.length} papers`;
  const doi = p => p.doi ? `<a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener noreferrer">${esc(p.doi)}</a>` : '';
  const actions = '<td class="row-actions"><button type="button" class="small" data-act="edit">Edit</button><button type="button" class="small danger" data-act="del">Delete</button></td>';
  $('lt-table').innerHTML = view === 'list'
    ? `<thead><tr><th>Title</th><th>Authors</th><th>Year</th><th>Tags</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p => `<tr data-id="${p.id}">
        <td><b>${esc(p.title)}</b>${p.journal ? `<br><small class="muted">${esc(p.journal)}</small>` : ''}${p.doi ? `<br><small>${doi(p)}</small>` : ''}${p.notes ? `<br><small class="muted">${esc(p.notes)}</small>` : ''}</td>
        <td>${esc(p.authors)}</td><td>${esc(p.year)}</td><td>${tagsOf(p).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</td><td>${esc(p.status)}</td>${actions}</tr>`).join('')}</tbody>`
    : `<thead><tr><th>Paper</th><th>Method</th><th>Data</th><th>Findings</th><th>Gaps</th><th></th></tr></thead><tbody>${rows.map(p => `<tr data-id="${p.id}">
        <td><b>${esc(surname(p.authors))} (${esc(p.year || 'n.d.')})</b><br><small>${esc(p.title)}</small></td>
        <td>${esc(p.method)}</td><td>${esc(p.data)}</td><td>${esc(p.findings)}</td><td>${esc(p.gaps)}</td>${actions}</tr>`).join('')}</tbody>`;
  if (!rows.length) $('lt-table').innerHTML += '<tbody><tr><td colspan="6" class="muted">No papers match.</td></tr></tbody>';
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  v.doi = v.doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  if (v.doi && !/^10\.\d{4,9}\/\S+$/.test(v.doi)) return alert('DOI should look like 10.1016/j.ijrmms.2020.104000');
  if (v.year && !(/^\d{4}$/.test(v.year) && v.year >= 1900 && v.year <= 2100)) return alert('Year must be a four-digit year.');
  const i = papers.findIndex(p => p.id === v.id);
  if (i >= 0) papers[i] = v; else papers.push({ ...v, id: uid() });
  save('lit.papers', papers);
  form.reset();
  form.elements.id.value = '';
  $('lt-form-box').open = false;
  render();
});
$('lt-cancel').onclick = () => { form.reset(); form.elements.id.value = ''; };

$('lt-table').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const p = papers.find(x => x.id === b.closest('tr').dataset.id);
  if (b.dataset.act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = p[el.name] ?? '';
    $('lt-form-box').open = true;
    form.scrollIntoView({ behavior: 'smooth' });
  } else if (confirm(`Delete “${p.title}”?`)) {
    papers = papers.filter(x => x !== p);
    save('lit.papers', papers);
    render();
  }
});

for (const id of ['lt-q', 'lt-status', 'lt-tag']) $(id).addEventListener('input', render);
$('lt-status').innerHTML = '<option value="">All statuses</option>' + STATUS.map(s => `<option>${s}</option>`).join('');
form.elements.status.innerHTML = STATUS.map(s => `<option>${s}</option>`).join('');
$('lt-list').onclick = () => { view = 'list'; save('lit.view', view); render(); };
$('lt-matrix').onclick = () => { view = 'matrix'; save('lit.view', view); render(); };

// ---------- Exports ----------
const bibEsc = s => String(s || '').replace(/[{}]/g, '').replace(/([&%$#_])/g, '\\$1');
function bibtex(list) {
  const used = new Map();
  return list.map(p => {
    const base = (surname(p.authors) + (p.year || '') + ((p.title.match(/[A-Za-z]{4,}/) || ['x'])[0])).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    const key = n ? base + String.fromCharCode(97 + n) : base;
    const authors = (p.authors || '').split(';').map(a => a.trim()).filter(Boolean).join(' and ');
    const f = [['title', p.title], ['author', authors], ['journal', p.journal], ['year', p.year], ['doi', p.doi], ['keywords', tagsOf(p).join(', ')]]
      .filter(([, v]) => v).map(([k, v]) => `  ${k} = {${k === 'doi' ? String(v).replace(/[{}]/g, '') : bibEsc(v)}}`);
    return `@article{${key},\n${f.join(',\n')}\n}`;
  }).join('\n\n') + '\n';
}
$('lt-bib').onclick = () => { const l = filtered(); if (!l.length) return alert('No papers to export.'); download(`literature-${today()}.bib`, bibtex(l), 'application/x-bibtex'); };
$('lt-csv').onclick = () => {
  const cols = ['title', 'authors', 'year', 'journal', 'doi', 'tags', 'status', 'method', 'data', 'findings', 'gaps', 'notes'];
  const l = filtered();
  if (!l.length) return alert('No papers to export.');
  download(`literature-${today()}.csv`, '﻿' + csv([cols, ...l.map(p => cols.map(c => p[c]))]), 'text/csv');
};

// ---------- Review outline builder ----------
const DEFAULT_OUTLINE = {
  title: 'Review paper outline',
  sections: ['Abstract', 'Introduction', 'Review methodology (databases, keywords, inclusion criteria)', 'Fundamentals and mechanisms', 'Laboratory and experimental studies', 'Numerical modelling approaches', 'Field applications and monitoring', 'Challenges and research gaps', 'Future research directions', 'Conclusions']
    .map(title => ({ id: uid(), title, tag: '', notes: '' })),
};
let outline = load('lit.outline', DEFAULT_OUTLINE);
const persistOutline = debounce(() => save('lit.outline', outline), 250);
$('ol-title').value = outline.title;
$('ol-title').oninput = e => { outline.title = e.target.value; persistOutline(); };

function renderOutline() {
  $('ol-list').innerHTML = outline.sections.map((s, i) => `<li data-id="${s.id}" class="ol-item">
    <div class="ol-row"><span class="num">${i + 1}</span><input data-f="title" value="${esc(s.title)}" aria-label="Section title">
    <input data-f="tag" value="${esc(s.tag)}" placeholder="papers tag" aria-label="Papers tag" class="ol-tag">
    <span class="row-actions"><button type="button" class="small" data-act="up" aria-label="Move up">↑</button><button type="button" class="small" data-act="down" aria-label="Move down">↓</button><button type="button" class="small danger" data-act="del" aria-label="Remove">✕</button></span></div>
    <textarea data-f="notes" rows="2" placeholder="Key points / arguments" aria-label="Notes">${esc(s.notes)}</textarea></li>`).join('');
}
$('ol-list').addEventListener('input', e => {
  const s = outline.sections.find(x => x.id === e.target.closest('li').dataset.id);
  s[e.target.dataset.f] = e.target.value;
  persistOutline();
});
$('ol-list').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const S = outline.sections, i = S.findIndex(x => x.id === b.closest('li').dataset.id);
  if (b.dataset.act === 'up' && i > 0) S.splice(i - 1, 0, ...S.splice(i, 1));
  else if (b.dataset.act === 'down' && i < S.length - 1) S.splice(i + 1, 0, ...S.splice(i, 1));
  else if (b.dataset.act === 'del' && confirm(`Remove “${S[i].title}”?`)) S.splice(i, 1);
  else return;
  save('lit.outline', outline);
  renderOutline();
});
$('ol-add').onclick = () => { outline.sections.push({ id: uid(), title: 'New section', tag: '', notes: '' }); save('lit.outline', outline); renderOutline(); };
$('ol-reset').onclick = () => { if (confirm('Reset the outline to the default template?')) { outline = structuredClone(DEFAULT_OUTLINE); $('ol-title').value = outline.title; save('lit.outline', outline); renderOutline(); } };
$('ol-md').onclick = () => {
  const md = [`# ${outline.title}`, ''];
  outline.sections.forEach((s, i) => {
    md.push(`## ${i + 1}. ${s.title}`, '');
    if (s.notes.trim()) md.push(s.notes.trim(), '');
    const refs = s.tag.trim() ? papers.filter(p => tagsOf(p).includes(s.tag.trim())) : [];
    if (refs.length) md.push('Key papers:', ...refs.map(p => `- ${p.authors || 'Anon'} (${p.year || 'n.d.'}). ${p.title}.${p.doi ? ` https://doi.org/${p.doi}` : ''}`), '');
  });
  download(`review-outline-${today()}.md`, md.join('\n'), 'text/markdown');
};

render();
renderOutline();
