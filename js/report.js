// Report Generator: activities with photos, rule-based drafting, A4 PDF via jsPDF + autoTable.
import { load, save, uid, esc, download, readFile, debounce, photoPut, photoDel, photoEntries, fmtDate, today, onTab } from './store.js';
import { normalizeReportSeed } from './seed-activities.js';

const EMPTY = { title: 'Activity Report', from: '', to: '', summary: '', reflection: '', activities: [] };
let state = { ...EMPTY, ...load('report', EMPTY) };
const photos = new Map();
const open = new Set();
const persist = debounce(() => save('report', state), 300);
const $ = id => document.getElementById(id);
const list = $('act-list');

// An activity's `photos` are ordered slots { id, caption, w?, h? }; a slot is empty until an image is stored under its id.
const FIELDS = [
  ['title', 'Title', 'text'], ['shortTitle', 'Short title (table)', 'text'], ['date', 'Date', 'date'], ['time', 'Time', 'text'],
  ['venue', 'Venue', 'text'], ['organizer', 'Organizer', 'text'], ['institutions', 'Institutions', 'text'],
  ['participants', 'Participants', 'text'], ['role', 'Role', 'text'],
  ['objectives', 'Objectives', 'area'], ['description', 'Description', 'area'], ['outcomes', 'Outcomes', 'area'],
];

const isIn = a => (!state.from || (a.date && a.date >= state.from)) && (!state.to || (a.date && a.date <= state.to));
const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
const find = id => state.activities.find(a => a.id === id);

// ---------- Rule-based drafting ----------
const KINDS = [
  ['conference', /conference|symposium|congress|forum/i],
  ['seminar', /seminar|lecture|talk|webinar|colloquium|academic report/i],
  ['workshop', /workshop|training|course|tutorial|bootcamp/i],
  ['field', /field|site|mine visit|underground|excursion|visit/i],
  ['lab', /lab|experiment|test|specimen|sample|uniaxial|triaxial/i],
  ['presentation', /present|defen[cs]e|proposal|midterm|poster/i],
  ['meeting', /meeting|group|discussion|supervisor|progress/i],
  ['cultural', /cultur|festival|volunteer|sport|community|exchange|ceremony/i],
];
const TOPICS = [
  [/backfill|paste|tailings|cemented/i, 'backfill mining'],
  [/rockburst|strainburst|burst|dynamic disaster/i, 'strainburst mechanisms'],
  [/support|hydraulic|roof|shield/i, 'intelligent ground support'],
  [/transparent|holograph|geolog/i, 'transparent geological modelling'],
  [/infrared|thermal|thermograph/i, 'infrared sensing'],
  [/numerical|flac|pfc|udec|3dec|abaqus|simulation|model/i, 'numerical modelling'],
  [/autonomous|closed-loop|control|automation/i, 'closed-loop control of support equipment'],
];
const TYPE_KIND = { conference: 'conference', seminar: 'seminar', workshop: 'workshop', training: 'workshop', safety: 'workshop', field: 'field', lab: 'lab', presentation: 'presentation', meeting: 'meeting', culture: 'cultural', cultural: 'cultural' };
const kindOf = a => TYPE_KIND[a.type] || (KINDS.find(([, re]) => re.test(`${a.title} ${a.description}`)) || ['general'])[0];
const topicsOf = text => TOPICS.filter(([re]) => re.test(text)).map(([, t]) => t);
const joinList = xs => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
function interests() {
  const p = load('profile', {});
  return (p.interests || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean);
}
function topicPhrase(a) {
  const t = topicsOf(`${a.title} ${a.description} ${a.objectives}`);
  return joinList(t.length ? t : interests().slice(0, 2)) || 'my research field';
}

const OBJ = {
  conference: t => ['To present and discuss recent research findings with the international research community', `To learn about current advances related to ${t}`, 'To build academic networks with researchers and industry practitioners'],
  seminar: t => ['To gain up-to-date knowledge from experts in the field', `To relate the presented concepts to my research on ${t}`, 'To practise academic discussion and questioning in English'],
  workshop: t => ['To acquire practical skills and methods through hands-on training', `To apply the techniques learned to ${t}`],
  field: t => ['To observe mining conditions and engineering practice on site', `To connect field observations with my research on ${t}`, 'To collect information and data that support laboratory and numerical work'],
  lab: t => ['To prepare specimens and perform the planned laboratory tests', `To obtain reliable data for the study of ${t}`, 'To improve competence in experimental procedures and laboratory safety'],
  presentation: t => ['To report research progress and receive feedback from the committee and peers', `To refine the research plan on ${t}`],
  meeting: t => ['To report progress and discuss problems with the supervisor and group members', `To agree on the next steps of the research on ${t}`],
  cultural: () => ['To take part in academic and cultural life at the university', 'To strengthen cross-cultural communication and friendship', 'To promote mutual understanding between Indonesia and China'],
  general: t => ['To broaden academic knowledge and professional skills', `To support my research on ${t}`],
};
const OUT = {
  conference: t => ['Presented and/or discussed research with peers and received constructive feedback', `Identified new references and research directions on ${t}`, 'Established contacts for potential future collaboration'],
  seminar: t => ['Gained a clearer understanding of the topics presented', `Noted ideas that can be applied to ${t}`],
  workshop: t => ['Acquired practical skills that can be used directly in my research', `Prepared to apply the method to ${t}`],
  field: t => ['Understood the actual geological and engineering conditions on site', `Collected observations and data relevant to ${t}`],
  lab: t => ['Completed the planned tests and recorded the results', `Obtained data for further analysis of ${t}`, 'Improved experimental skills and awareness of laboratory safety'],
  presentation: t => ['Received feedback that improves the quality of the research', `Updated the research plan and schedule for ${t}`],
  meeting: () => ['Clarified the research tasks and priorities for the coming weeks', 'Resolved technical problems with guidance from the supervisor'],
  cultural: () => ['Built friendships and improved communication skills in a multicultural environment', 'Shared Indonesian culture and learned more about Chinese culture'],
  general: t => ['Gained new knowledge and experience', `Identified points that support my research on ${t}`],
};
const bullets = xs => xs.map(x => `- ${x}`).join('\n');
const draftObjectives = a => bullets(OBJ[kindOf(a)](topicPhrase(a)));
const draftOutcomes = a => bullets(OUT[kindOf(a)](topicPhrase(a)));

function periodLabel() {
  const acts = state.activities.filter(isIn).sort(byDate);
  const from = state.from || acts[0]?.date, to = state.to || acts.at(-1)?.date;
  return from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : 'All activities';
}

function draftSummary() {
  const p = load('profile', {});
  const acts = state.activities.filter(isIn);
  const counts = {};
  for (const a of acts) counts[kindOf(a)] = (counts[kindOf(a)] || 0) + 1;
  const NAMES = { conference: 'conference', seminar: 'seminar/lecture', workshop: 'workshop/training', field: 'field visit', lab: 'laboratory session', presentation: 'presentation', meeting: 'research meeting', cultural: 'cultural/community activity', general: 'other activity' };
  const plural = s => s.endsWith('y') ? s.slice(0, -1) + 'ies' : s + 's';
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${n > 1 ? plural(NAMES[k]) : NAMES[k]}`);
  const who = [p.name || 'I', p.programme && `a ${p.programme} student`, p.university && `at ${p.university}`].filter(Boolean).join(', ');
  const topics = joinList([...new Set(acts.flatMap(a => topicsOf(`${a.title} ${a.description}`)))]) || joinList(interests().slice(0, 3)) || 'my research field';
  return `This report summarises the academic and non-academic activities carried out by ${who}${p.supervisor ? `, under the supervision of ${p.supervisor}` : ''}, during the period ${periodLabel()}. `
    + `In total, ${acts.length} activit${acts.length === 1 ? 'y was' : 'ies were'} recorded${parts.length ? `, comprising ${joinList(parts)}` : ''}. `
    + `These activities supported my research on ${topics} and contributed to my development as a researcher${p.scholarship ? ` and as a recipient of the ${p.scholarship}` : ''}.`;
}

function draftReflection() {
  const acts = state.activities.filter(isIn);
  const kinds = new Set(acts.map(kindOf));
  const s = ['Looking back on this reporting period, the activities provided valuable opportunities to strengthen both my research and my personal development.'];
  if (kinds.has('conference') || kinds.has('seminar') || kinds.has('workshop')) s.push('Academic events exposed me to current research trends and new methods, and encouraged me to communicate my work more clearly in English.');
  if (kinds.has('lab') || kinds.has('field')) s.push('Laboratory and field work helped me connect theory with practice and improved my understanding of real mining conditions.');
  if (kinds.has('meeting') || kinds.has('presentation')) s.push('Regular discussions and presentations with my supervisor and research group kept the work on schedule and improved its quality through critical feedback.');
  if (kinds.has('cultural')) s.push('Cultural and community activities helped me adapt to life in China and build friendships across cultures.');
  s.push('In the next period, I plan to consolidate the results obtained, continue writing my thesis and research papers, and apply the knowledge gained to my research.');
  return s.join(' ');
}

// ---------- Rendering ----------
function summaryHtml(a, i) {
  return `<span class="num">${i + 1}</span><span class="sum-title">${esc(a.title || 'Untitled activity')}</span><span class="sum-date">${a.date ? fmtDate(a.date, true) : 'No date'}</span><span class="badge out-badge">outside period</span>`;
}

function cardHtml(a, i) {
  const fields = FIELDS.map(([f, label, type]) => type === 'area'
    ? `<div class="field span2"><div class="field-head"><span>${label}</span>${f !== 'description' ? `<button type="button" class="small" data-act="draft-${f}">Auto-draft</button>` : ''}</div>
       <textarea data-f="${f}" rows="${f === 'description' ? 5 : 3}" aria-label="${label}" placeholder="${f === 'description' ? 'What happened, what you did' : 'One point per line, start with -'}">${esc(a[f])}</textarea></div>`
    : `<label>${label}<input type="${type}" data-f="${f}" value="${esc(a[f])}"${f === 'title' || f === 'date' ? ' required' : ''}></label>`).join('');
  const ph = a.photos.map(p => {
    const src = photos.get(p.id);
    return `<figure data-pid="${p.id}"${src ? '' : ' class="empty"'}>
      <label class="tile" title="${src ? 'Replace photo' : 'Add photo'}">${src ? `<img src="${src}" alt="${esc(p.caption)}">` : '<span class="tile-add"><b>+</b>Add photo</span>'}<input type="file" accept="image/*" hidden data-slot-input></label>
      <textarea data-cap rows="3" placeholder="Caption" aria-label="Caption">${esc(p.caption)}</textarea>
      <span class="row-actions">${src ? '<button type="button" class="small" data-act="photo-clear">Remove photo</button>' : ''}<button type="button" class="small danger" data-act="slot-del">Delete slot</button></span></figure>`;
  }).join('');
  const filled = a.photos.filter(p => photos.has(p.id)).length;
  return `<details class="act${isIn(a) ? '' : ' excluded'}" data-id="${a.id}"${open.has(a.id) ? ' open' : ''}>
    <summary>${summaryHtml(a, i)}</summary>
    <div class="grid">${fields}</div>
    <div class="photos"><div class="field-head"><strong>Photos <span class="muted small-text">${filled}/${a.photos.length} filled · empty slots are left out of the PDF</span></strong>
      <span class="row-actions"><button type="button" class="small" data-act="slot-add">+ Empty slot</button><label class="btn small">Add photos<input type="file" accept="image/*" multiple hidden data-photo-input></label></span></div>
      <div class="photo-grid">${ph || '<p class="muted">No photos yet. Photos are downscaled and stay in this browser.</p>'}</div></div>
    <div class="toolbar end"><button type="button" class="small" data-act="up">Move up</button><button type="button" class="small" data-act="down">Move down</button><button type="button" class="small danger" data-act="del">Delete activity</button></div>
  </details>`;
}

function render() {
  list.innerHTML = state.activities.map(cardHtml).join('') || '<p class="muted card">No activities yet. Click “Add activity”, or use “Add to report” on a calendar event.</p>';
  updateCount();
}
function updateCount() {
  const n = state.activities.filter(isIn).length;
  $('rp-count').textContent = `${state.activities.length} activities · ${n} in the reporting period`;
}

for (const k of ['title', 'from', 'to', 'summary', 'reflection']) {
  const el = $('rp-' + k);
  el.value = state[k] || '';
  el.addEventListener('input', () => {
    state[k] = el.value;
    persist();
    if (k === 'from' || k === 'to') list.querySelectorAll('.act').forEach(c => c.classList.toggle('excluded', !isIn(find(c.dataset.id))));
    updateCount();
  });
}
const confirmReplace = el => !el.value.trim() || confirm('Replace the existing text with an auto-draft?');
$('rp-draft-summary').onclick = () => { const el = $('rp-summary'); if (confirmReplace(el)) { el.value = draftSummary(); el.dispatchEvent(new Event('input')); } };
$('rp-draft-reflection').onclick = () => { const el = $('rp-reflection'); if (confirmReplace(el)) { el.value = draftReflection(); el.dispatchEvent(new Event('input')); } };

export function addActivity(prefill = {}) {
  const a = { id: uid(), title: '', date: today(), venue: '', organizer: '', participants: '', role: 'Participant', objectives: '', description: '', outcomes: '', photos: [], ...prefill };
  state.activities.push(a);
  open.add(a.id);
  save('report', state);
  render();
  return a;
}
$('rp-add').onclick = () => { const a = addActivity(); list.querySelector(`[data-id="${a.id}"] input`)?.focus(); };
$('rp-sort').onclick = () => { state.activities.sort(byDate); persist(); render(); };

list.addEventListener('toggle', e => { const id = e.target.dataset?.id; if (id) e.target.open ? open.add(id) : open.delete(id); }, true);

list.addEventListener('input', e => {
  const card = e.target.closest('.act');
  if (!card) return;
  const a = find(card.dataset.id), f = e.target.dataset.f;
  if (f) {
    a[f] = e.target.value;
    if (f === 'title' || f === 'date') {
      card.querySelector('summary').innerHTML = summaryHtml(a, state.activities.indexOf(a));
      card.classList.toggle('excluded', !isIn(a));
      updateCount();
    }
  } else if ('cap' in e.target.dataset) {
    a.photos.find(p => p.id === e.target.closest('figure').dataset.pid).caption = e.target.value;
  }
  persist();
});

list.addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.act'), a = find(card.dataset.id), i = state.activities.indexOf(a);
  const act = btn.dataset.act;
  if (act.startsWith('draft-')) {
    const f = act.slice(6), ta = card.querySelector(`[data-f="${f}"]`);
    if (!confirmReplace(ta)) return;
    ta.value = f === 'objectives' ? draftObjectives(a) : draftOutcomes(a);
    a[f] = ta.value;
    persist();
    return;
  }
  const pid = btn.closest('figure')?.dataset.pid, slot = a.photos.find(p => p.id === pid);
  if (act === 'photo-clear') {
    delete slot.w; delete slot.h;
    photos.delete(pid);
    await photoDel(pid);
  } else if (act === 'slot-del') {
    if (photos.has(pid) && !confirm('Delete this slot and its photo?')) return;
    a.photos = a.photos.filter(p => p !== slot);
    photos.delete(pid);
    await photoDel(pid);
  } else if (act === 'slot-add') {
    a.photos.push({ id: uid(), caption: '' });
  } else if (act === 'del') {
    if (!confirm(`Delete “${a.title || 'Untitled activity'}” and its photos?`)) return;
    state.activities.splice(i, 1);
    for (const p of a.photos) { photos.delete(p.id); await photoDel(p.id); }
  } else if (act === 'up' && i > 0) {
    state.activities.splice(i - 1, 0, ...state.activities.splice(i, 1));
  } else if (act === 'down' && i < state.activities.length - 1) {
    state.activities.splice(i + 1, 0, ...state.activities.splice(i, 1));
  } else return;
  save('report', state);
  render();
});

async function downscale(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(`Cannot read “${file.name}” (unsupported image format?)`));
      im.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: c.toDataURL('image/jpeg', 0.8), w, h };
  } finally { URL.revokeObjectURL(url); }
}

list.addEventListener('change', async e => {
  if ('slotInput' in e.target.dataset) { // fill (or replace) one slot, keeping its caption and place
    const file = e.target.files[0];
    if (!file) return;
    const a = find(e.target.closest('.act').dataset.id), slot = a.photos.find(p => p.id === e.target.closest('figure').dataset.pid);
    try {
      if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” is not an image`);
      const { data, w, h } = await downscale(file);
      await photoPut(slot.id, data);
      photos.set(slot.id, data);
      Object.assign(slot, { w, h });
      save('report', state);
      render();
    } catch (err) { alert(err.message); }
    return;
  }
  if (!('photoInput' in e.target.dataset)) return;
  const a = find(e.target.closest('.act').dataset.id);
  const errors = [];
  for (const file of e.target.files) {
    if (!file.type.startsWith('image/')) { errors.push(`“${file.name}” is not an image`); continue; }
    try {
      const { data, w, h } = await downscale(file);
      const id = uid();
      await photoPut(id, data);
      photos.set(id, data);
      a.photos.push({ id, caption: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), w, h });
    } catch (err) { errors.push(err.message); }
  }
  save('report', state);
  render();
  if (errors.length) alert(errors.join('\n'));
});

// ---------- Seed (real activities live only in the encrypted vault) ----------
const seed = () => load('report.seed', null);
const showSeed = () => { $('rp-reset').hidden = !seed(); };
async function applySeed(sd) {
  for (const a of state.activities) for (const p of a.photos) { photos.delete(p.id); await photoDel(p.id).catch(() => {}); }
  const fresh = normalizeReportSeed(sd, uid);
  state = { ...state, summary: fresh.summary, reflection: fresh.reflection, activities: fresh.activities };
  open.clear();
  save('report', state);
  for (const k of ['summary', 'reflection']) $('rp-' + k).value = state[k];
  render();
}
async function importSeed(text) {
  let sd;
  try { sd = JSON.parse(text); normalizeReportSeed(sd, uid); } catch (e) { return alert(`Import failed: ${e instanceof SyntaxError ? 'not valid JSON' : e.message}`); }
  if (state.activities.length && !confirm(`Replace the current ${state.activities.length} activities (and their photos), summary and reflection with the ${sd.activities.length} imported activities?`)) return;
  save('report.seed', sd);
  await applySeed(sd);
  showSeed();
  $('rp-json').value = '';
}
$('rp-import').onclick = () => importSeed($('rp-json').value);
$('rp-import-file').onclick = () => readFile().then(importSeed, () => {});
$('rp-reset').onclick = () => { if (confirm('Reset all activities, the summary and the reflection to the seed? Current photos are removed.')) applySeed(seed()); };
// First run on a device that already has the seed (e.g. after a Drive sync) but no report yet.
if (!load('report', null) && seed()) applySeed(seed());
showSeed();

// ---------- Draft JSON ----------
$('rp-save').onclick = () => {
  const ids = state.activities.flatMap(a => a.photos.map(p => p.id));
  download(`report-draft-${today()}.json`, JSON.stringify({ app: 'research-desk-report', version: 1, report: state, photos: Object.fromEntries(ids.filter(id => photos.has(id)).map(id => [id, photos.get(id)])) }));
};
$('rp-load').onclick = async () => {
  try {
    const d = JSON.parse(await readFile());
    if (d.app !== 'research-desk-report' || !Array.isArray(d.report?.activities)) throw new Error('This is not a report draft file.');
    if (state.activities.length && !confirm('Replace the current report draft?')) return;
    for (const [id, data] of Object.entries(d.photos || {})) {
      if (typeof data !== 'string' || !data.startsWith('data:image/')) continue;
      await photoPut(id, data);
      photos.set(id, data);
    }
    state = { ...EMPTY, ...d.report };
    state.activities = state.activities.map(a => ({ ...a, photos: Array.isArray(a.photos) ? a.photos : [] }));
    save('report', state);
    for (const k of ['title', 'from', 'to', 'summary', 'reflection']) $('rp-' + k).value = state[k] || '';
    render();
  } catch (e) { if (e.message !== 'No file chosen') alert('Load failed: ' + e.message); }
};

// ---------- PDF ----------
// Helvetica covers Latin-1 only: map typographic characters, replace the rest.
const clean = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/…/g, '...').replace(/•/g, '-').replace(/[   ]/g, ' ').replace(/[^\n\x20-\x7E¡-ÿ]/g, '?');

function textImage(text, color = '#1f3a5f', px = 96) {
  if (!text) return null;
  const font = `600 ${px}px "Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 8;
  c.height = Math.ceil(px * 1.3);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, c.height / 2);
  return { data: c.toDataURL('image/png'), ratio: c.width / c.height };
}

function makePdf() {
  const J = window.jspdf;
  if (!J?.jsPDF || !J.jsPDF.API.autoTable) return alert('The PDF library has not loaded yet. Connect to the internet once; after that it works offline.');
  const p = load('profile', {});
  const acts = state.activities.filter(isIn).sort(byDate);
  if (!acts.length) return alert('No activities in the selected reporting period.');
  const bad = acts.filter(a => !a.title?.trim() || !a.date);
  if (bad.length) return alert(`Every activity needs a title and a date (${bad.length} incomplete).`);
  if (!p.name && !confirm('Your profile has no name yet. Generate anyway?')) return;

  const doc = new J.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, CW = W - 2 * M, BOTTOM = H - 20;
  const NAVY = [31, 58, 95], SOFT = [234, 239, 246], INK = 30;
  let y = M;
  const need = h => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const tableBase = { margin: { left: M, right: M, top: M, bottom: 22 }, styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, textColor: INK, lineColor: [200, 208, 220], lineWidth: 0.2 } };

  const heading = (txt, size = 13) => {
    need(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...NAVY);
    doc.text(clean(txt), M, y + 5);
    if (size >= 13) { doc.setDrawColor(...NAVY); doc.setLineWidth(0.4); doc.line(M, y + 7.5, M + CW, y + 7.5); }
    y += size >= 13 ? 12 : 9;
  };
  const para = txt => {
    const size = 10.5, lh = size * 0.3528 * 1.45;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(INK);
    const text = clean(txt).trim() || '-';
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) { y += lh * 0.5; continue; }
      const bullet = /^[-*]\s+/.test(line);
      const body = bullet ? line.replace(/^[-*]\s+/, '') : line;
      const ind = bullet ? 5 : 0;
      doc.splitTextToSize(body, CW - ind).forEach((part, i) => {
        need(lh);
        if (bullet && i === 0) { doc.setFillColor(...NAVY); doc.circle(M + 1.6, y + lh * 0.5, 0.7, 'F'); }
        doc.text(part, M + ind, y + lh * 0.72);
        y += lh;
      });
    }
    y += 3;
  };

  // Cover
  const cn = textImage(p.cnName);
  const cnInk = textImage(p.cnName, '#1e1e1e');
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text(doc.splitTextToSize(clean(state.title || 'Activity Report'), CW), M, 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
  doc.text(clean(`Reporting period: ${periodLabel()}`), M, 52);
  if (p.university) doc.text(clean(p.university), M, 60);
  y = 96;
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(clean(p.name || ''), M, y);
  if (cn) { const h = 9, x = M + doc.getTextWidth(clean(p.name || '')) + (p.name ? 4 : 0); doc.addImage(cn.data, 'PNG', x, y - 7, h * cn.ratio, h); }
  y += 8;
  const info = [
    ['Name', p.name], ['Chinese name', ''], ['Nationality', p.nationality], ['Student ID', p.studentId], ['Programme', p.programme],
    ['University', p.university], ['Supervisor', p.supervisor], ['Scholarship', p.scholarship],
    ['Reporting period', periodLabel()], ['Number of activities', String(acts.length)], ['Date of report', fmtDate(today())],
  ].filter(([k, v]) => v || (k === 'Chinese name' && cn)).map(([k, v]) => [k, clean(v)]);
  doc.autoTable({
    ...tableBase, startY: y, theme: 'grid', body: info,
    columnStyles: { 0: { fontStyle: 'bold', fillColor: SOFT, textColor: NAVY, cellWidth: 52 } },
    didParseCell: d => { if (d.section === 'body' && d.row.raw[0] === 'Chinese name') d.cell.styles.minCellHeight = 10; },
    didDrawCell: d => {
      if (d.section === 'body' && d.column.index === 1 && d.row.raw[0] === 'Chinese name' && cnInk) {
        const h = 6; doc.addImage(cnInk.data, 'PNG', d.cell.x + 2, d.cell.y + (d.cell.height - h) / 2, h * cnInk.ratio, h);
      }
    },
  });

  // Summary + glance table
  doc.addPage(); y = M;
  heading('Summary');
  para(state.summary || draftSummary());
  heading('Activities at a Glance');
  doc.autoTable({
    ...tableBase, startY: y, theme: 'striped',
    head: [['No.', 'Date', 'Activity', 'Venue', 'Role']],
    body: acts.map((a, i) => [String(i + 1), fmtDate(a.date, true), clean(a.shortTitle || a.title), clean(a.venue || '-'), clean(a.role || '-')]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 26 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Activities
  let fig = 0;
  acts.forEach((a, i) => {
    doc.addPage(); y = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    const tl = doc.splitTextToSize(clean(a.title), CW - 10);
    const bh = 10 + tl.length * 6;
    doc.setFillColor(...NAVY); doc.rect(M, y, CW, bh, 'F');
    doc.setTextColor(190, 205, 228); doc.setFontSize(8.5);
    doc.text(`ACTIVITY ${i + 1}  |  ${fmtDate(a.date).toUpperCase()}`, M + 5, y + 6);
    doc.setTextColor(255); doc.setFontSize(13);
    doc.text(tl, M + 5, y + 12.5);
    y += bh + 4;
    doc.autoTable({
      ...tableBase, startY: y, theme: 'grid',
      body: [['Date', [fmtDate(a.date), a.time].filter(Boolean).join(', ')], ['Venue', a.venue], ['Organizer', a.organizer], ['Institutions', a.institutions], ['Participants', a.participants], ['Role', a.role]]
        .filter(([k, v]) => v || k !== 'Institutions').map(([k, v]) => [k, clean(v || '-')]),
      columnStyles: { 0: { fontStyle: 'bold', fillColor: SOFT, textColor: NAVY, cellWidth: 40 } },
    });
    y = doc.lastAutoTable.finalY + 7;
    heading('Objectives', 11.5); para(a.objectives || draftObjectives(a));
    heading('Description', 11.5); para(a.description);
    const ph = a.photos.filter(x => photos.has(x.id));
    if (ph.length) {
      const gap = 6, cw = (CW - gap) / 2, maxH = 68;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      const rows = [];
      for (let k = 0; k < ph.length; k += 2) {
        const pair = ph.slice(k, k + 2).map(x => {
          const r = x.w && x.h ? x.h / x.w : 0.75;
          let w = cw, h = cw * r;
          if (h > maxH) { h = maxH; w = h / r; }
          return { x, w, h, cap: doc.splitTextToSize(clean(`Figure ${++fig}. ${x.caption || a.title}`), cw) };
        });
        const imgH = Math.max(...pair.map(q => q.h));
        rows.push({ pair, imgH, rowH: imgH + 3 + Math.max(...pair.map(q => q.cap.length)) * 4 + 4 });
      }
      need(9 + rows[0].rowH); // keep the heading with the first row of photos
      heading('Documentation', 11.5);
      for (const { pair, imgH, rowH } of rows) {
        need(rowH);
        pair.forEach((q, j) => {
          const x0 = pair.length === 1 ? M + (CW - cw) / 2 : M + j * (cw + gap);
          const ix = x0 + (cw - q.w) / 2, iy = y + (imgH - q.h) / 2;
          doc.addImage(photos.get(q.x.id), 'JPEG', ix, iy, q.w, q.h, q.x.id, 'FAST');
          doc.setDrawColor(200, 208, 220); doc.setLineWidth(0.2); doc.rect(ix, iy, q.w, q.h);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(70);
          doc.text(q.cap, x0 + cw / 2, y + imgH + 5, { align: 'center' });
        });
        y += rowH;
      }
    }
    heading('Outcomes', 11.5); para(a.outcomes || draftOutcomes(a));
  });

  // Reflection + signatures
  doc.addPage(); y = M;
  heading('Overall Reflection');
  para(state.reflection || draftReflection());
  need(60);
  y += 12;
  const col = (x, label, lines) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
    doc.text(label, x, y);
    doc.setDrawColor(80); doc.setLineWidth(0.3); doc.line(x, y + 24, x + 70, y + 24);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(INK);
    lines.filter(Boolean).forEach((l, k) => doc.text(clean(l), x, y + 30 + k * 5));
  };
  col(M, 'Prepared by', [p.name, p.studentId && `Student ID: ${p.studentId}`, `Date: ${fmtDate(today())}`]);
  col(M + CW / 2 + 5, 'Acknowledged by (Supervisor)', [p.supervisor, p.university, 'Date:']);

  // Footer on every page
  const n = doc.getNumberOfPages();
  const left = clean([p.name, p.studentId].filter(Boolean).join('  |  '));
  for (let k = 1; k <= n; k++) {
    doc.setPage(k);
    doc.setDrawColor(200, 208, 220); doc.setLineWidth(0.3); doc.line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110);
    doc.text(left, M, H - 9);
    doc.text(`Page ${k} of ${n}`, W - M, H - 9, { align: 'right' });
  }
  doc.save(`activity-report-${state.from || 'all'}.pdf`);
}
$('rp-pdf').onclick = () => {
  try { makePdf(); } catch (e) { alert('PDF generation failed: ' + e.message); console.error(e); }
};

onTab('report', render);
photoEntries().then(entries => { for (const [id, d] of entries) photos.set(id, d); render(); }, () => render());
