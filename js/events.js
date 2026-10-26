// Gathers calendar events from every source: planner, timetable and conference/journal deadlines.
import { load, today } from './store.js';
import { expandEvents, isIsoDate, addDays, weekdayMon0, startOfWeek } from './calc.js';

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
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const userEvents = () => load('events', []).map(e => ({ ...e, source: 'planner' }));

export function timetableEvents() {
  const tt = load('timetable', { termStart: '', termEnd: '', classes: [] });
  const anchor = isIsoDate(tt.termStart) ? tt.termStart : startOfWeek(today());
  return tt.classes.map(c => ({
    id: 'tt-' + c.id, source: 'timetable', type: 'class', repeat: 'weekly',
    title: c.course, venue: c.room, notes: c.teacher ? `Teacher: ${c.teacher}` : '',
    date: addDays(anchor, (Number(c.day) - weekdayMon0(anchor) + 7) % 7),
    start: c.start, end: c.end, until: isIsoDate(tt.termEnd) ? tt.termEnd : '', reminder: c.reminder ?? '',
  }));
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
