// Semester timetable: courses meet in numbered periods during listed teaching weeks.
// They show in the calendar as weekly repeats (see events.js).
import { load, save, uid, esc, today, fmtDate, onTab } from './store.js';
import { DAY_KEYS, isIsoDate, addDays, parseWeeks, parseSlots, formatSlots, weekRange, weekOf, weekSessions, courseSessions, totalCredits } from './calc.js';
import { SEED, PERIODS } from './seed.js';

const $ = id => document.getElementById(id);
const COLORS = ['#2b6cb0', '#2f855a', '#b7791f', '#6b46c1', '#c53030', '#2c7a7b', '#b83280'];
const fromSeed = () => ({ ...structuredClone(SEED), courses: SEED.courses.map(c => ({ ...structuredClone(c), id: uid() })) });

// First run (nothing stored, or the old empty time-based timetable) loads the seed.
let tt = load('timetable', null);
if (!tt || (!Array.isArray(tt.courses) && !tt.classes?.length)) save('timetable', tt = fromSeed());
else if (!Array.isArray(tt.courses)) save('timetable', tt = migrate(tt));

// Old timetable stored clock times; map each class onto the periods it overlaps.
function migrate(old) {
  const p = PERIODS.map(x => x.split('-'));
  const start = isIsoDate(old.termStart) ? old.termStart : SEED.semesterStart;
  const last = isIsoDate(old.termEnd) ? Math.max(1, weekOf(start, old.termEnd)) : 20;
  return {
    semesterStart: start,
    courses: old.classes.map(c => {
      const from = Math.max(1, p.findIndex(([, e]) => e > c.start) + 1 || p.length);
      const to = Math.max(from, p.findLastIndex(([s]) => s < c.end) + 1);
      return { id: c.id || uid(), code: '', name: c.course, teacher: c.teacher || '', credits: 0, weeks: `1-${last}`, slots: [{ day: DAY_KEYS[Number(c.day)] || 'Mon', from, to }], room: c.room || '', reminder: c.reminder ?? '' };
    }),
  };
}

const persist = () => save('timetable', tt);
const periods = () => (tt.periods?.length ? tt.periods : PERIODS);
const color = c => COLORS[tt.courses.indexOf(c) % COLORS.length];
const currentWeek = () => Math.max(1, weekOf(tt.semesterStart, today()));
let week = currentWeek();

const form = $('tt-form');
$('tt-start').value = tt.semesterStart;
$('tt-start').addEventListener('change', e => {
  if (!isIsoDate(e.target.value)) return;
  tt.semesterStart = e.target.value;
  persist();
  render();
});
$('tt-periods').value = periods().join('\n');
$('tt-periods').addEventListener('change', e => {
  const lines = e.target.value.split(/\n+/).map(s => s.trim().replace(/\s*[-–~]\s*/, '-')).filter(Boolean);
  const bad = lines.find(l => !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(l));
  if (bad) return alert(`"${bad}" is not a period like 08:00-08:45.`);
  tt.periods = lines;
  persist();
  render();
});

$('tt-prev').onclick = () => { week = Math.max(1, week - 1); renderWeek(); };
$('tt-next').onclick = () => { week += 1; renderWeek(); };
$('tt-now').onclick = () => { week = currentWeek(); renderWeek(); };
$('tt-reset').onclick = () => {
  if (!confirm('Replace the whole timetable (courses, semester start and period times) with the seed timetable?')) return;
  tt = fromSeed();
  persist();
  $('tt-start').value = tt.semesterStart;
  $('tt-periods').value = periods().join('\n');
  week = currentWeek();
  render();
};

function renderWeek() {
  const { from, to } = weekRange(tt.semesterStart, week);
  $('tt-week-label').textContent = `Week ${week} · ${fmtDate(from, true)} – ${fmtDate(to, true)}`;
  let sessions = [];
  try { sessions = weekSessions(tt, week); } catch { /* a course with bad weeks is flagged in the list */ }
  const rows = Math.max(periods().length, ...sessions.map(s => s.to));
  const t = today();
  let html = '<div class="tt-corner"></div>' + DAY_KEYS.map((d, i) => {
    const date = addDays(from, i);
    return `<div class="tt-head${date === t ? ' today' : ''}" style="grid-column:${i + 2}">${d}<small>${Number(date.slice(5, 7))}/${Number(date.slice(8))}</small></div>`;
  }).join('');
  for (let r = 1; r <= rows; r++) {
    const [a, b] = (periods()[r - 1] || '').split('-');
    html += `<div class="tt-period" style="grid-row:${r + 1}"><b>${r}</b>${a ? `<small>${a}<br>${b}</small>` : ''}</div>`;
    for (let i = 0; i < 7; i++) html += `<div class="tt-cell" style="grid-row:${r + 1};grid-column:${i + 2}"></div>`;
  }
  html += sessions.map(s => `<div class="tt-item" style="grid-row:${s.from + 1}/${s.to + 2};grid-column:${DAY_KEYS.indexOf(s.day) + 2};--c:${color(s.course)}" title="${esc(`${s.course.name}\nPeriods ${s.from}-${s.to}`)}">
    <b>${esc(s.course.name)}</b><small>${[s.course.room, s.course.teacher].filter(Boolean).map(esc).join(' · ')}</small><small>Periods ${s.from}-${s.to}</small></div>`).join('');
  $('tt-grid').innerHTML = html;
  $('tt-grid').style.gridTemplateRows = `auto repeat(${rows}, minmax(2.6rem, auto))`;
  $('tt-empty').hidden = sessions.length > 0;
}

function renderCourses() {
  $('tt-courses').innerHTML = tt.courses.map(c => {
    let span;
    try { const s = courseSessions(c, tt.semesterStart); span = s.length ? `${fmtDate(s[0].date, true)} – ${fmtDate(s.at(-1).date, true)}` : ''; } catch { span = 'invalid weeks'; }
    return `<tr data-id="${c.id}"><td><span class="tt-dot" style="--c:${color(c)}"></span>${esc(c.code)}</td><td>${esc(c.name)}</td><td>${esc(c.teacher)}</td><td>${esc(c.credits)}</td>
      <td>${esc(c.weeks)}<br><small class="muted">${span}</small></td><td>${esc(formatSlots(c.slots))}</td><td>${esc(c.room)}</td>
      <td class="row-actions"><button type="button" class="small" data-act="edit">Edit</button><button type="button" class="small danger" data-act="del">Delete</button></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">No courses yet.</td></tr>';
  $('tt-credits').textContent = totalCredits(tt.courses);
}

function render() { renderWeek(); renderCourses(); }

const clearForm = () => { form.reset(); form.elements.id.value = ''; };
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  let slots;
  try { parseWeeks(v.weeks); slots = parseSlots(v.slots); } catch (err) { return alert(err.message); }
  if (!slots.length) return alert('Add at least one slot, e.g. "Mon 1-2".');
  if (v.reminder !== '' && !(Number(v.reminder) >= 0)) return alert('Reminder must be 0 or more minutes.');
  const course = { ...v, credits: Number(v.credits) || 0, slots, id: v.id || uid() };
  const i = tt.courses.findIndex(c => c.id === v.id);
  if (i >= 0) tt.courses[i] = course; else tt.courses.push(course);
  persist();
  clearForm();
  render();
});
$('tt-cancel').onclick = clearForm;

$('tt-courses').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const c = tt.courses.find(x => x.id === b.closest('tr').dataset.id);
  if (b.dataset.act === 'edit') {
    for (const el of form.elements) if (el.name) el.value = el.name === 'slots' ? formatSlots(c.slots) : c[el.name] ?? '';
    form.scrollIntoView({ behavior: 'smooth' });
    form.elements.code.focus();
  } else if (confirm(`Delete ${c.name}?`)) {
    tt.courses = tt.courses.filter(x => x !== c);
    persist();
    render();
  }
});

onTab('timetable', renderWeek);
render();
