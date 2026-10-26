// Weekly class timetable; classes show in the calendar as weekly repeats (see events.js).
import { load, save, uid, esc } from './store.js';
import { DAYS } from './events.js';

const $ = id => document.getElementById(id);
const tt = load('timetable', { termStart: '', termEnd: '', classes: [] });
const form = $('tt-form');
const persist = () => save('timetable', tt);

form.elements.day.innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
$('tt-start').value = tt.termStart;
$('tt-end').value = tt.termEnd;
for (const k of ['start', 'end']) {
  $('tt-' + k).addEventListener('change', e => {
    tt['term' + k[0].toUpperCase() + k.slice(1)] = e.target.value;
    if (tt.termStart && tt.termEnd && tt.termEnd < tt.termStart) alert('The term end is before the term start.');
    persist();
  });
}

function render() {
  $('tt-grid').innerHTML = DAYS.map((d, i) => {
    const items = tt.classes.filter(c => Number(c.day) === i).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="tt-day"><h4>${d}</h4>${items.map(c => `
      <div class="tt-item" data-id="${c.id}"><b>${esc(c.start)}–${esc(c.end)}</b><span>${esc(c.course)}</span>
      <small>${[c.room, c.teacher].filter(Boolean).map(esc).join(' · ')}</small>
      <span class="row-actions"><button type="button" class="small" data-act="edit">Edit</button><button type="button" class="small danger" data-act="del">Delete</button></span></div>`).join('') || '<p class="muted small-text">Free</p>'}</div>`;
  }).join('');
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  if (v.end <= v.start) return alert('End time must be after start time.');
  if (v.reminder !== '' && !(Number(v.reminder) >= 0)) return alert('Reminder must be 0 or more minutes.');
  const i = tt.classes.findIndex(c => c.id === v.id);
  if (i >= 0) tt.classes[i] = v; else tt.classes.push({ ...v, id: uid() });
  persist();
  form.reset();
  form.elements.id.value = '';
  render();
});
$('tt-cancel').onclick = () => { form.reset(); form.elements.id.value = ''; };

$('tt-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const c = tt.classes.find(x => x.id === b.closest('.tt-item').dataset.id);
  if (b.dataset.act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = c[el.name] ?? '';
    form.scrollIntoView({ behavior: 'smooth' });
    form.elements.course.focus();
  } else if (confirm(`Delete ${c.course}?`)) {
    tt.classes = tt.classes.filter(x => x !== c);
    persist();
    render();
  }
});

render();
