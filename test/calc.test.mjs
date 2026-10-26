// Smoke test: node test/calc.test.mjs
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

// Backfill: equal solid densities make the arithmetic easy to check by hand.
const m = C.backfillMix({ solidsPct: 50, tailingsPerCement: 4, rhoCement: 2000, rhoTailings: 2000, rhoWater: 1000 });
near(m.rhoSolids, 2000);
near(m.rhoSlurry, 1 / (0.5 / 2000 + 0.5 / 1000));
near(m.solidsConc, 0.5);
near(m.waterCement, 5);
near(m.cementPerM3, m.rhoSlurry * 0.1);
near(m.waterPerM3, m.rhoSlurry * 0.5);
assert.throws(() => C.backfillMix({ solidsPct: 100, tailingsPerCement: 4, rhoCement: 3100, rhoTailings: 2700 }), RangeError);

// Rockburst screening
const b = C.brittleness(100, 10);
near(b.B1, 10); near(b.B2, 90 / 110);
assert.equal(C.stressRatio(15, 100).label, 'No rockburst');
assert.equal(C.stressRatio(20, 100).label, 'Weak');
assert.equal(C.stressRatio(40, 100).label, 'Moderate');
assert.equal(C.stressRatio(60, 100).label, 'Strong');
assert.equal(C.wetIndex(4, 1).label, 'Moderate');
assert.equal(C.wetIndex(6, 1).level, 3);
assert.throws(() => C.brittleness(100, 0), RangeError);

// Infrared: ε = 1 is the identity; ε < 1 with a colder background reads low, so T_obj > T_app.
near(C.emissivityCorrect({ tAppC: 50, tReflC: 20, eps: 1 }).tObjC, 50);
const ir = C.emissivityCorrect({ tAppC: 50, tReflC: 20, eps: 0.95 });
near(ir.tObjK, ((323.15 ** 4 - 0.05 * 293.15 ** 4) / 0.95) ** 0.25);
assert.ok(ir.tObjC > 50);
assert.throws(() => C.emissivityCorrect({ tAppC: 50, tReflC: 20, eps: 0 }), RangeError);

// Dates and repeat expansion
assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
assert.equal(C.weekdayMon0('2026-10-26'), 0); // Monday
assert.equal(C.isIsoDate('2026-02-30'), false);
const occ = C.expandEvents([
  { id: 'w', title: 'Class', date: '2026-09-07', start: '08:00', repeat: 'weekly', until: '2026-10-20' },
  { id: 'o', title: 'Talk', date: '2026-10-14', start: '07:00', repeat: 'none' },
  { id: 'x', title: 'Out', date: '2026-11-30', repeat: 'none' },
], '2026-10-01', '2026-10-31');
assert.deepEqual(occ.map(o => `${o.id}:${o.date}`), ['w:2026-10-05', 'w:2026-10-12', 'o:2026-10-14', 'w:2026-10-19']);

const wk = C.weeklyTotals([{ date: '2026-10-26', hours: 2 }, { date: '2026-10-27', hours: 1.5 }, { date: '2026-10-19', hours: 3 }], '2026-10-28', 2);
assert.deepEqual(wk, [{ week: '2026-10-19', hours: 3 }, { week: '2026-10-26', hours: 3.5 }]);

// ICS
const ics = C.buildICS([
  { id: 'a1', title: 'Seminar; rock, mechanics', date: '2026-10-28', start: '14:00', end: '15:30', venue: 'Room 101', reminder: 15, repeat: 'weekly', until: '2026-12-30' },
  { id: 'd1', title: 'Deadline ' + 'x'.repeat(90), date: '2026-11-01' },
], { now: new Date(Date.UTC(2026, 9, 26, 8, 0, 0)) });
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
assert.match(ics, /DTSTART:20261028T140000\r\nDTEND:20261028T153000/);
assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261230T235959/);
assert.match(ics, /SUMMARY:Seminar\\; rock\\, mechanics/);
assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:[^\r]+\r\nTRIGGER:-PT15M\r\nEND:VALARM/);
assert.match(ics, /DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102/);
assert.match(ics, /DTSTAMP:20261026T080000Z/);
assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'lines folded to 75 octets');
assert.equal(C.hmAdd('23:30', 60), '23:59');

console.log('calc.js smoke test: all assertions passed');
