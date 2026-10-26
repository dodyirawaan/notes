// Report seed import. The real seed (activities, summary, reflection) is NOT kept here: this repo is public.
// It is pasted once as JSON in the Report tab and stored only in the encrypted vault (key 'report.seed').
import { isIsoDate } from './calc.js';

const lines = v => (Array.isArray(v) ? v : v ? [v] : []).map(s => String(s).trim()).filter(Boolean);
const bullets = v => lines(v).map(s => `- ${s.replace(/^[-*]\s*/, '')}`).join('\n');

// Seed JSON → report fields. Each activity's photoSlots become empty photo slots (caption, no image yet).
export function normalizeReportSeed(j, makeId) {
  if (!j || !Array.isArray(j.activities)) throw new RangeError('Need an "activities" list.');
  return {
    summary: String(j.summary ?? ''),
    reflection: String(j.reflection ?? ''),
    activities: j.activities.map((a, i) => {
      if (!a?.title || !isIsoDate(a.date)) throw new RangeError(`Activity ${i + 1} needs a title and a yyyy-mm-dd date.`);
      const text = k => String(a[k] ?? '').trim();
      return {
        id: makeId(), title: text('title'), shortTitle: text('shortTitle'), type: text('type'), date: a.date, time: text('time'),
        venue: text('venue'), organizer: text('organizer'), institutions: text('institutions'), participants: text('participants'),
        role: text('role') || 'Participant',
        objectives: bullets(a.objectives), description: lines(a.description).join('\n\n'), outcomes: bullets(a.outcomes),
        photos: lines(a.photoSlots).map(caption => ({ id: makeId(), caption })),
      };
    }),
  };
}
