// Pure functions only: no DOM, no storage, no network. Covered by test/calc.test.mjs.

export const KELVIN = 273.15;

function num(v, name, { min, max, gt, lt } = {}) {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be a number.`);
  if (gt !== undefined && !(x > gt)) throw new RangeError(`${name} must be greater than ${gt}.`);
  if (lt !== undefined && !(x < lt)) throw new RangeError(`${name} must be less than ${lt}.`);
  if (min !== undefined && x < min) throw new RangeError(`${name} must be at least ${min}.`);
  if (max !== undefined && x > max) throw new RangeError(`${name} must be at most ${max}.`);
  return x;
}

// Returns the class index: value < bounds[i] falls in class i, otherwise the last class.
export function classify(value, bounds, labels) {
  const i = bounds.findIndex(b => value < b);
  const level = i === -1 ? bounds.length : i;
  return { level, label: labels[level] };
}

const BURST_LABELS = ['No rockburst', 'Weak', 'Moderate', 'Strong'];
export const RUSSENES = { bounds: [0.2, 0.3, 0.55], labels: BURST_LABELS };
export const WET_CLASSES = { bounds: [2, 3.5, 5], labels: BURST_LABELS };

// ---------- Backfill mix (per 1 kg of slurry; densities in kg/m3) ----------
export function backfillMix({ solidsPct, tailingsPerCement, rhoCement, rhoTailings, rhoWater = 1000 }) {
  const cw = num(solidsPct, 'Solids mass fraction', { gt: 0, lt: 100 }) / 100;
  const n = num(tailingsPerCement, 'Tailings part N (cement : tailings = 1 : N)', { gt: 0 });
  const rc = num(rhoCement, 'Cement density', { gt: 0 });
  const rt = num(rhoTailings, 'Tailings density', { gt: 0 });
  const rw = num(rhoWater, 'Water density', { gt: 0 });
  const Ms = cw, Mw = 1 - cw;
  const Mc = Ms / (1 + n), Mt = Ms - Mc;
  const rhoSolids = Ms / (Mc / rc + Mt / rt);
  const rhoSlurry = (Ms + Mw) / (Ms / rhoSolids + Mw / rw);
  return {
    rhoSolids,
    rhoSlurry,
    solidsConc: Ms / (Ms + Mw),
    waterCement: Mw / Mc,
    cementInSolids: Mc / Ms,
    cementPerM3: rhoSlurry * Mc,
    tailingsPerM3: rhoSlurry * Mt,
    waterPerM3: rhoSlurry * Mw,
  };
}

// ---------- Rockburst / strainburst screening ----------
export function brittleness(sc, st) {
  const c = num(sc, 'σc (UCS)', { gt: 0 });
  const t = num(st, 'σt (tensile strength)', { gt: 0 });
  return { B1: c / t, B2: (c - t) / (c + t) };
}

export function stressRatio(sTheta, sc) {
  const s = num(sTheta, 'σθ (max. tangential stress)', { min: 0 });
  const c = num(sc, 'σc (UCS)', { gt: 0 });
  const ratio = s / c;
  return { ratio, ...classify(ratio, RUSSENES.bounds, RUSSENES.labels) };
}

export function wetIndex(phiSp, phiSt) {
  const sp = num(phiSp, 'Retained elastic energy Φsp', { gt: 0 });
  const st = num(phiSt, 'Dissipated energy Φst', { gt: 0 });
  const wet = sp / st;
  return { wet, ...classify(wet, WET_CLASSES.bounds, WET_CLASSES.labels) };
}

// ---------- Infrared emissivity correction ----------
export const cToK = c => c + KELVIN;
export const kToC = k => k - KELVIN;

export function emissivityCorrect({ tAppC, tReflC, eps }) {
  const e = num(eps, 'Emissivity ε', { gt: 0, max: 1 });
  const ta = cToK(num(tAppC, 'Apparent temperature', { gt: -KELVIN }));
  const tr = cToK(num(tReflC, 'Reflected temperature', { min: -KELVIN }));
  const inner = (ta ** 4 - (1 - e) * tr ** 4) / e;
  if (!(inner > 0)) throw new RangeError('No physical solution: reflected radiation exceeds the measured signal. Check ε and T_refl.');
  const tObjK = inner ** 0.25;
  return { tAppK: ta, tReflK: tr, tObjK, tObjC: kToC(tObjK) };
}

// ---------- Dates (ISO yyyy-mm-dd; arithmetic in UTC so DST never shifts a day) ----------
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toIso = d => d.toISOString().slice(0, 10);

export function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(fromIso(s)) === s;
}
export const addDays = (iso, n) => { const d = fromIso(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
export const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
export const weekdayMon0 = iso => (fromIso(iso).getUTCDay() + 6) % 7;
export const startOfWeek = iso => addDays(iso, -weekdayMon0(iso));

// Expands one-off and weekly events into occurrences within [from, to] (inclusive).
export function expandEvents(events, from, to) {
  const out = [];
  for (const ev of events) {
    if (!isIsoDate(ev.date)) continue;
    if (ev.repeat === 'weekly') {
      const until = isIsoDate(ev.until) && ev.until < to ? ev.until : to;
      let d = ev.date;
      if (d < from) d = addDays(d, Math.ceil(daysBetween(d, from) / 7) * 7);
      for (; d <= until; d = addDays(d, 7)) out.push({ ...ev, date: d, seriesStart: ev.date });
    } else if (ev.date >= from && ev.date <= to) {
      out.push({ ...ev, seriesStart: ev.date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
}

// ---------- Semester timetable (week 1 is the Monday-start week containing semesterStart) ----------
export const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "2-17", "1,3,5-9" → sorted unique week numbers.
export function parseWeeks(spec) {
  const out = new Set();
  for (const part of String(spec ?? '').split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    const a = m && Number(m[1]), b = m && Number(m[2] ?? m[1]);
    if (!m || a < 1 || b < a) throw new RangeError(`Bad week range "${part}"`);
    for (let w = a; w <= b; w++) out.add(w);
  }
  return [...out].sort((x, y) => x - y);
}
// [2,3,4,7] → [[2,4],[7,7]]
export function weekRuns(weeks) {
  const runs = [];
  for (const w of weeks) {
    const last = runs.at(-1);
    if (last && w === last[1] + 1) last[1] = w; else runs.push([w, w]);
  }
  return runs;
}
// "Tue 5-8, Thu 9" ⇄ [{day:'Tue',from:5,to:8},{day:'Thu',from:9,to:9}]
export function parseSlots(spec) {
  return String(spec ?? '').split(/[,;，；]+/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^([A-Za-z]{3})\w*\s*(\d+)(?:\s*-\s*(\d+))?$/);
    const day = m && DAY_KEYS.find(d => d.toLowerCase() === m[1].toLowerCase());
    const from = m && Number(m[2]), to = m && Number(m[3] ?? m[2]);
    if (!day || from < 1 || to < from) throw new RangeError(`Bad slot "${s}" (use e.g. "Tue 5-8")`);
    return { day, from, to };
  });
}
export const formatSlots = slots => slots.map(s => `${s.day} ${s.from === s.to ? s.from : `${s.from}-${s.to}`}`).join(', ');

export const weekStart = (semesterStart, n) => addDays(startOfWeek(semesterStart), 7 * (n - 1));
export const weekRange = (semesterStart, n) => ({ from: weekStart(semesterStart, n), to: addDays(weekStart(semesterStart, n), 6) });
export const weekOf = (semesterStart, iso) => Math.floor(daysBetween(startOfWeek(semesterStart), iso) / 7) + 1;

// Every class meeting of one course, in date order.
export function courseSessions(course, semesterStart) {
  const out = [];
  for (const week of parseWeeks(course.weeks)) {
    for (const s of course.slots) out.push({ course, week, day: s.day, from: s.from, to: s.to, date: addDays(weekStart(semesterStart, week), DAY_KEYS.indexOf(s.day)) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
}
export const weekSessions = (tt, n) => tt.courses.flatMap(c => courseSessions(c, tt.semesterStart).filter(s => s.week === n));
export const totalCredits = courses => courses.reduce((t, c) => t + (Number(c.credits) || 0), 0);

// Weekly hour totals (weeks start Monday) for the `weeks` weeks ending with the week of todayIso.
export function weeklyTotals(entries, todayIso, weeks = 12) {
  const first = addDays(startOfWeek(todayIso), -7 * (weeks - 1));
  const buckets = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, 7 * i), hours: 0 }));
  for (const e of entries) {
    if (!isIsoDate(e.date)) continue;
    const i = Math.floor(daysBetween(first, e.date) / 7);
    if (i >= 0 && i < weeks) buckets[i].hours += Number(e.hours) || 0;
  }
  return buckets;
}

// ---------- iCalendar (RFC 5545) ----------
const icsEscape = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utf8Len = ch => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
const icsDate = iso => iso.replace(/-/g, '');
const icsDateTime = (iso, hm) => `${icsDate(iso)}T${hm.replace(':', '')}00`;
const isHm = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function hmAdd(hm, minutes) {
  const [h, m] = hm.split(':').map(Number);
  const t = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Lines longer than 75 octets are folded with CRLF + space.
export function foldLine(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = utf8Len(ch);
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

export const icsStamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Events use floating local time (the phone shows them in its own time zone).
export function buildICS(events, { now = new Date(), calName = 'Research Desk' } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Research Desk//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`];
  const stamp = icsStamp(now);
  for (const ev of events) {
    if (!isIsoDate(ev.date) || !ev.title) continue;
    const timed = isHm(ev.start);
    L.push('BEGIN:VEVENT', `UID:${ev.id}@research-desk`, `DTSTAMP:${stamp}`);
    if (timed) {
      const end = isHm(ev.end) && ev.end > ev.start ? ev.end : hmAdd(ev.start, 60);
      L.push(`DTSTART:${icsDateTime(ev.date, ev.start)}`, `DTEND:${icsDateTime(ev.date, end)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(ev.date, 1))}`);
    }
    if (ev.repeat === 'weekly') {
      const until = isIsoDate(ev.until) ? `;UNTIL=${icsDate(ev.until)}${timed ? 'T235959' : ''}` : '';
      L.push(`RRULE:FREQ=WEEKLY${until}`);
    }
    L.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.venue) L.push(`LOCATION:${icsEscape(ev.venue)}`);
    if (ev.notes) L.push(`DESCRIPTION:${icsEscape(ev.notes)}`);
    if (ev.type) L.push(`CATEGORIES:${icsEscape(ev.type)}`);
    const r = parseInt(ev.reminder, 10);
    if (Number.isFinite(r) && r >= 0) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${r}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(foldLine).join('\r\n') + '\r\n';
}
