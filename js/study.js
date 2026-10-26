// Study log with a hand-drawn canvas chart of weekly totals.
import { load, save, uid, esc, today, fmtDate, onTab, debounce } from './store.js';
import { weeklyTotals, isIsoDate } from './calc.js';

const $ = id => document.getElementById(id);
let entries = load('study', []);
const form = $('st-form');
const canvas = $('st-chart');
form.elements.date.value = today();

function renderList() {
  const rows = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  $('st-body').innerHTML = rows.map(e => `<tr data-id="${e.id}"><td>${fmtDate(e.date, true)}</td><td>${Number(e.hours).toFixed(1)}</td><td>${esc(e.topic)}</td><td><span class="tag">${esc(e.tag)}</span></td>
    <td><button type="button" class="small danger" data-act="del" aria-label="Delete">✕</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="muted">No study sessions logged yet.</td></tr>';
  const wk = weeklyTotals(entries, today(), 1)[0].hours;
  $('st-week').textContent = `${wk.toFixed(1)} h this week · ${entries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)} h total`;
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = devicePixelRatio || 1, W = rect.width, H = 220;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const navy = css.getPropertyValue('--navy').trim(), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim(), accent = css.getPropertyValue('--accent').trim();
  const weeks = W < 480 ? 8 : 12;
  const data = weeklyTotals(entries, today(), weeks);
  const max = Math.max(5, ...data.map(d => d.hours));
  const step = max > 40 ? 10 : max > 20 ? 5 : max > 10 ? 2 : 1;
  const top = Math.ceil(max / step) * step;
  const L = 34, R = 8, T = 16, B = 28, cw = (W - L - R) / weeks;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= top; v += step) {
    const y = T + (H - T - B) * (1 - v / top);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, Math.round(y) + 0.5); ctx.lineTo(W - R, Math.round(y) + 0.5); ctx.stroke();
    ctx.fillStyle = muted; ctx.fillText(`${v}h`, L - 6, y);
  }
  data.forEach((d, i) => {
    const h = (H - T - B) * (d.hours / top), x = L + i * cw + cw * 0.18, w = cw * 0.64, y = H - B - h;
    ctx.fillStyle = i === weeks - 1 ? accent : navy;
    if (h > 0) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, [3, 3, 0, 0]) : ctx.rect(x, y, w, h); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (d.hours > 0) { ctx.fillStyle = muted; ctx.fillText(d.hours.toFixed(d.hours % 1 ? 1 : 0), x + w / 2, y - 4); }
    ctx.fillStyle = muted;
    ctx.fillText(fmtDate(d.week, true).split(' ').slice(0, 2).join(' '), x + w / 2, H - 10);
  });
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
  const h = Number(v.hours);
  if (!isIsoDate(v.date) || !(h > 0 && h <= 24)) return alert('Enter a valid date and 0–24 hours.');
  entries.push({ id: uid(), date: v.date, hours: h, topic: v.topic, tag: v.tag });
  save('study', entries);
  form.elements.topic.value = '';
  form.elements.hours.value = '';
  renderList(); draw();
});
$('st-body').addEventListener('click', e => {
  if (!e.target.closest('[data-act=del]')) return;
  const id = e.target.closest('tr').dataset.id;
  if (!confirm('Delete this entry?')) return;
  entries = entries.filter(x => x.id !== id);
  save('study', entries);
  renderList(); draw();
});

addEventListener('resize', debounce(draw, 150));
onTab('study', () => { renderList(); draw(); });
renderList();
