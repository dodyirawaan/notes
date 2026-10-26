// Dashboard: this week, upcoming deadlines, open tasks and report progress.
import { load, esc, today, fmtDate, goto, onTab } from './store.js';
import { addDays, startOfWeek, daysBetween, isIsoDate } from './calc.js';
import { TYPES, DAYS, occurrences } from './events.js';

const $ = id => document.getElementById(id);
const PRIO = { high: 0, medium: 1, low: 2 };

function render() {
  const t = today(), ws = startOfWeek(t), we = addDays(ws, 6), until = addDays(t, 14);
  const p = load('profile', {});
  $('db-hello').textContent = p.name ? `Welcome back, ${p.name.split(' ')[0]}.` : 'Welcome. Start by filling in your Profile.';
  $('db-date').textContent = `${DAYS[(new Date().getDay() + 6) % 7]}, ${fmtDate(t)}`;

  // This week
  const week = occurrences(ws, we);
  $('db-week').innerHTML = DAYS.map((d, i) => {
    const date = addDays(ws, i), items = week.filter(o => o.date === date);
    return `<div class="db-day${date === t ? ' today' : ''}"><b>${d} ${Number(date.slice(8))}</b>${items.map(o => `<div class="db-ev" style="--c:${TYPES[o.type]?.color || '#718096'}">${o.start ? `<span>${o.start}</span> ` : ''}${esc(o.title)}</div>`).join('') || '<span class="muted small-text">—</span>'}</div>`;
  }).join('');

  // Deadlines (next 14 days, including overdue tasks)
  const dl = [
    ...occurrences(t, until).filter(o => o.type === 'deadline').map(o => ({ date: o.date, title: o.title, src: 'Calendar' })),
    ...load('tasks', []).filter(x => x.status !== 'done' && isIsoDate(x.due) && x.due <= until).map(x => ({ date: x.due, title: x.title, src: 'Task' })),
    ...load('milestones', []).filter(m => m.status !== 'done' && isIsoDate(m.date) && m.date >= t && m.date <= until).map(m => ({ date: m.date, title: m.title, src: 'Milestone' })),
    ...load('documents', []).filter(d => isIsoDate(d.expiry) && d.expiry <= until).map(d => ({ date: d.expiry, title: `${d.name} expires`, src: 'Document' })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  $('db-deadlines').innerHTML = dl.map(d => {
    const n = daysBetween(t, d.date);
    return `<li><span class="badge ${n < 0 ? 'lv-3' : n <= 3 ? 'lv-2' : 'lv-1'}">${n < 0 ? `${-n} d overdue` : n === 0 ? 'today' : `in ${n} d`}</span> ${esc(d.title)} <small class="muted">${d.src} · ${fmtDate(d.date, true)}</small></li>`;
  }).join('') || '<li class="muted">Nothing due in the next 14 days.</li>';

  // Open tasks by priority
  const open = load('tasks', []).filter(x => x.status !== 'done');
  $('db-tasks').innerHTML = ['high', 'medium', 'low'].map(pr => {
    const items = open.filter(x => x.priority === pr).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return `<div class="db-prio prio-${pr}"><h4>${pr[0].toUpperCase() + pr.slice(1)} <span class="count">${items.length}</span></h4><ul>${items.slice(0, 5).map(x => `<li>${esc(x.title)}${x.due ? ` <small class="${x.due < t ? 'overdue-text' : 'muted'}">${fmtDate(x.due, true)}</small>` : ''}</li>`).join('')}${items.length > 5 ? `<li class="muted">+${items.length - 5} more</li>` : ''}</ul></div>`;
  }).join('');

  // Report progress
  const r = load('report', { from: '', activities: [] });
  const n = r.activities.filter(a => !r.from || (a.date && a.date >= r.from)).length;
  $('db-count').textContent = n;
  $('db-count-label').textContent = r.from ? `activities logged since ${fmtDate(r.from)}` : 'activities logged (set a report start date in Report Generator)';
}

$('db-open-report').onclick = () => goto('report');
document.querySelectorAll('[data-goto]').forEach(b => (b.onclick = () => goto(b.dataset.goto)));
onTab('dashboard', render);
