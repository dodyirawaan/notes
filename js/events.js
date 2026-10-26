// Gathers calendar events from every source: planner, timetable and conference/journal deadlines.
import { load } from './store.js';
import { expandEvents, isIsoDate, addDays, DAY_KEYS, parseWeeks, weekRuns, weekStart } from './calc.js';
import { PERIODS } from './seed.js';

export const TYPES = {
  class: { label: 'Class', color: '#2b6cb0' },
  seminar: { label: 'Seminar', color: '#6b46c1' },
  conference: { label: 'Conference', color: '#b83280' },
  'lab meeting': { label: 'Lab meeting', color: '#2c7a7b' },
  'supervisor meeting': { label: 'Supervisor meeting', color: '#c05621' },
  deadline: { label: 'Deadline', color: '#c53030' },
  activity: { label: 'Activity', color: '#2f855a' },
  personal: { label: 'Personal', color: '#718096' },
};
export const DAYS = DAY_KEYS;

export const userEvents = () => load('events', []).map(e => ({ ...e, source: 'planner' }));

// One weekly series per course slot and run of consecutive teaching weeks.
export function timetableEvents() {
  const tt = load('timetable', { semesterStart: '', courses: [] });
  if (!isIsoDate(tt.semesterStart) || !Array.isArray(tt.courses)) return [];
  const periods = tt.periods?.length ? tt.periods : PERIODS;
  const time = (p, i) => (periods[p - 1] || '').split('-')[i] || '';
  const out = [];
  for (const c of tt.courses) {
    let runs;
    try { runs = weekRuns(parseWeeks(c.weeks)); } catch { continue; }
    c.slots.forEach((s, si) => runs.forEach(([a, b], ri) => {
      const day = DAY_KEYS.indexOf(s.day);
      out.push({
        id: `tt-${c.id}-${si}-${ri}`, source: 'timetable', type: 'class', repeat: 'weekly',
        title: c.name, venue: c.room, notes: [c.code, c.teacher && `Teacher: ${c.teacher}`, `Periods ${s.from}-${s.to}`].filter(Boolean).join(' · '),
        date: addDays(weekStart(tt.semesterStart, a), day), until: addDays(weekStart(tt.semesterStart, b), day),
        start: time(s.from, 0), end: time(s.to, 1), reminder: c.reminder ?? '',
      });
    }));
  }
  return out;
}

export function venueEvents() {
  const out = [];
  for (const v of load('venues', [])) {
    if (isIsoDate(v.abstractDeadline)) out.push({ id: `v-${v.id}-abs`, source: 'venues', type: 'deadline', title: `Abstract deadline: ${v.name}`, date: v.abstractDeadline, notes: v.url || '', reminder: 1440 });
    if (isIsoDate(v.paperDeadline)) out.push({ id: `v-${v.id}-full`, source: 'venues', type: 'deadline', title: `Full-paper deadline: ${v.name}`, date: v.paperDeadline, notes: v.url || '', reminder: 1440 });
  }
  return out;
}

export const allEvents = () => [...userEvents(), ...timetableEvents(), ...venueEvents()];
export const occurrences = (from, to) => expandEvents(allEvents(), from, to);
