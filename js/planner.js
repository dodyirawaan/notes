// Planner: hand-built month/week calendar, event editor, .ics export and in-tab reminders.
import { load, save, uid, esc, download, today, fmtDate, monthName, goto, onTab } from './store.js';
import { addDays, startOfWeek, buildICS, isIsoDate } from './calc.js';
import { TYPES, DAYS, occurrences, allEvents } from './events.js';
import { addActivity } from './report.js';

const $ = id => document.getElementById(id);
let view = load('planner.view', 'month');
let cursor = today();
let shown = new Map();
const dlg = $('ev-dialog'), form = $('ev-form');

$('pl-legend').innerHTML = Object.values(TYPES).map(t => `<span class="legend"><i style="background:${t.color}"></i>${t.label}</span>`).join('');
form.elements.type.innerHTML = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');

const key = o => `${o.id}|${o.date}`;
const chip = o => {
  shown.set(key(o), o);
  const c = TYPES[o.type]?.color || '#718096';
  return `<button type="button" class="chip" data-occ="${esc(key(o))}" style="--c:${c}" title="${esc(o.title)}">${o.start ? `<b>${o.start}</b> ` : ''}${esc(o.title)}</button>`;
};

function render() {
  shown = new Map();
  const t = today();
  $('pl-month').setAttribute('aria-pressed', view === 'month');
  $('pl-week').setAttribute('aria-pressed', view === 'week');
  if (view === 'month') {
    const [y, m] = cursor.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const start = startOfWeek(first), end = addDays(start, 41);
    const occ = occurrences(start, end);
    $('pl-title').textContent = `${monthName(m - 1)} ${y}`;
    let html = DAYS.map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), items = occ.filter(o => o.date === d);
      const cls = ['day', d.slice(0, 7) !== first.slice(0, 7) && 'other', d === t && 'today'].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-date="${d}"><span class="dnum">${Number(d.slice(8))}</span>${items.slice(0, 3).map(chip).join('')}${items.length > 3 ? `<button type="button" class="more" data-week="${d}">+${items.length - 3} more</button>` : ''}</div>`;
    }
    $('pl-cal').className = 'cal month';
    $('pl-cal').innerHTML = html;
  } else {
    const start = startOfWeek(cursor), end = addDays(start, 6);
    const occ = occurrences(start, end);
    $('pl-title').textContent = `${fmtDate(start, true)} – ${fmtDate(end, true)}`;
    $('pl-cal').className = 'cal week';
    $('pl-cal').innerHTML = DAYS.map((name, i) => {
      const d = addDays(start, i), items = occ.filter(o => o.date === d);
      return `<div class="wday${d === t ? ' today' : ''}" data-date="${d}"><div class="whead"><span>${name} ${Number(d.slice(8))}</span><button type="button" class="small" data-add="${d}" aria-label="Add event on ${d}">+</button></div>${items.map(o => `${chip(o)}${o.venue ? `<div class="chip-sub">${esc(o.venue)}</div>` : ''}`).join('') || '<p class="muted small-text">—</p>'}</div>`;
    }).join('');
  }
}

function move(dir) {
  if (view === 'week') cursor = addDays(cursor, 7 * dir);
  else { const [y, m] = cursor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); cursor = d.toISOString().slice(0, 10); }
  render();
}
$('pl-prev').onclick = () => move(-1);
$('pl-next').onclick = () => move(1);
$('pl-today').onclick = () => { cursor = today(); render(); };
$('pl-month').onclick = () => { view = 'month'; save('planner.view', view); render(); };
$('pl-week').onclick = () => { view = 'week'; save('planner.view', view); render(); };
$('pl-add').onclick = () => edit(null, view === 'week' ? startOfWeek(cursor) === startOfWeek(today()) ? today() : startOfWeek(cursor) : today());

$('pl-cal').addEventListener('click', e => {
  const c = e.target.closest('[data-occ]');
  if (c) return openOcc(shown.get(c.dataset.occ));
  const w = e.target.closest('[data-week]');
  if (w) { cursor = w.dataset.week; view = 'week'; save('planner.view', view); return render(); }
  const a = e.target.closest('[data-add]');
  if (a) return edit(null, a.dataset.add);
  const day = e.target.closest('.day');
  if (day) edit(null, day.dataset.date);
});

function openOcc(o) {
  if (!o) return;
  if (o.source === 'planner') return edit(load('events', []).find(e => e.id === o.id));
  const tab = o.source === 'timetable' ? 'Timetable' : 'Conferences & journals';
  if (confirm(`${o.title}\n${fmtDate(o.date)}${o.start ? ` ${o.start}–${o.end || ''}` : ''}${o.venue ? `\n${o.venue}` : ''}\n\nThis comes from the ${tab} tab. Open it to edit?`)) goto(o.source);
}

// ---------- Editor ----------
function edit(ev, date) {
  form.reset();
  const e = ev || { id: '', type: 'activity', date, repeat: 'none', reminder: '' };
  for (const el of form.elements) if (el.name && e[el.name] !== undefined) el.value = e[el.name];
  $('ev-heading').textContent = ev ? 'Edit event' : 'New event';
  $('ev-delete').hidden = !ev;
  syncForm();
  dlg.showModal();
  form.elements.title.focus();
}
function syncForm() {
  $('ev-report').hidden = !['activity', 'seminar'].includes(form.elements.type.value);
  $('ev-until-wrap').hidden = form.elements.repeat.value !== 'weekly';
}
form.elements.type.onchange = syncForm;
form.elements.repeat.onchange = syncForm;
$('ev-cancel').onclick = () => dlg.close();

function readForm() {
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  if (!form.reportValidity()) return null;
  const err = !isIsoDate(v.date) ? 'Please enter a valid date.'
    : v.start && v.end && v.end <= v.start ? 'End time must be after start time.'
    : v.end && !v.start ? 'Add a start time, or clear the end time.'
    : v.repeat === 'weekly' && v.until && v.until < v.date ? '“Repeat until” must be on or after the event date.'
    : v.reminder !== '' && !(Number(v.reminder) >= 0) ? 'Reminder must be 0 or more minutes.' : '';
  if (err) { alert(err); return null; }
  if (v.repeat !== 'weekly') v.until = '';
  return v;
}

function store(v) {
  const events = load('events', []);
  if (!v.id) v.id = uid();
  const i = events.findIndex(e => e.id === v.id);
  i >= 0 ? (events[i] = v) : events.push(v);
  save('events', events);
  return v;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const v = readForm();
  if (!v) return;
  store(v);
  if (v.reminder !== '') askPermission();
  dlg.close();
  cursor = v.date;
  render();
});
$('ev-delete').onclick = () => {
  const id = form.elements.id.value;
  if (!confirm('Delete this event' + (form.elements.repeat.value === 'weekly' ? ' (all weekly repeats)?' : '?'))) return;
  save('events', load('events', []).filter(e => e.id !== id));
  dlg.close();
  render();
};
$('ev-report').onclick = () => {
  const v = readForm();
  if (!v) return;
  store(v);
  addActivity({ title: v.title, date: v.date, venue: v.venue, organizer: v.organizer, description: v.notes, role: 'Participant' });
  dlg.close();
  goto('report');
};

// ---------- .ics ----------
$('pl-ics').onclick = () => {
  const events = allEvents();
  if (!events.length) return alert('No events to export yet.');
  download(`research-desk-${today()}.ics`, buildICS(events), 'text/calendar');
};

// ---------- Browser notifications while the tab is open ----------
const canNotify = 'Notification' in window;
function askPermission() {
  if (!canNotify || Notification.permission !== 'default' || load('notifAsked', false)) return;
  save('notifAsked', true);
  Notification.requestPermission().then(updateNotifyBtn);
}
function updateNotifyBtn() {
  const b = $('pl-notify');
  if (!canNotify) { b.textContent = 'Reminders not supported'; b.disabled = true; return; }
  const p = Notification.permission;
  b.textContent = p === 'granted' ? 'Reminders on' : p === 'denied' ? 'Reminders blocked' : 'Enable reminders';
  b.disabled = p !== 'default';
}
$('pl-notify').onclick = () => { save('notifAsked', false); askPermission(); };

function checkReminders() {
  if (!canNotify || Notification.permission !== 'granted') return;
  const t = today(), now = Date.now();
  const done = new Set(load('notified', []));
  for (const o of occurrences(t, addDays(t, 2))) {
    const r = parseInt(o.reminder, 10);
    if (!Number.isFinite(r) || r < 0) continue;
    const [y, m, d] = o.date.split('-').map(Number);
    const [hh, mm] = (o.start || '00:00').split(':').map(Number);
    const startMs = new Date(y, m - 1, d, hh, mm).getTime();
    const endMs = o.start ? startMs : startMs + 86400000;
    if (now >= startMs - r * 60000 && now <= endMs && !done.has(key(o))) {
      done.add(key(o));
      new Notification(o.title, { body: `${fmtDate(o.date)}${o.start ? ` at ${o.start}` : ''}${o.venue ? ` · ${o.venue}` : ''}`, tag: key(o) });
    }
  }
  save('notified', [...done].filter(k => k.split('|')[1] >= addDays(t, -2)));
}

updateNotifyBtn();
setInterval(checkReminders, 30000);
checkReminders();
onTab('planner', render);
render();
