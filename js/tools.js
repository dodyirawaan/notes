// Calculator tabs: backfill mix, rockburst screening, infrared emissivity correction.
import * as C from './calc.js';
import { load, save } from './store.js';

const fmt = (x, d = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const rows = list => `<table class="data kv"><tbody>${list.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
const badge = c => `<span class="badge lv-${c.level}">${c.label}</span>`;

function bind(formId, outId, compute) {
  const f = document.getElementById(formId), out = document.getElementById(outId);
  const saved = load('calc.' + formId, null);
  if (saved) for (const el of f.elements) if (el.name && saved[el.name] !== undefined) el.value = saved[el.name];
  const run = () => {
    const v = Object.fromEntries(new FormData(f));
    save('calc.' + formId, v);
    try { out.innerHTML = compute(v); out.classList.remove('error'); }
    catch (e) { out.textContent = e.message; out.classList.add('error'); }
  };
  f.addEventListener('input', run);
  f.addEventListener('submit', e => { e.preventDefault(); run(); });
  run();
}

bind('bf-form', 'bf-out', v => {
  const r = C.backfillMix(v);
  return rows([
    ['Solids density ρ<sub>s</sub>', `${fmt(r.rhoSolids, 0)} kg/m³`],
    ['Slurry density ρ', `${fmt(r.rhoSlurry, 0)} kg/m³ (${fmt(r.rhoSlurry / 1000, 3)} t/m³)`],
    ['Solids concentration C<sub>w</sub>', `${fmt(r.solidsConc * 100, 1)} %`],
    ['Water / cement ratio', fmt(r.waterCement, 2)],
    ['Cement in solids', `${fmt(r.cementInSolids * 100, 2)} %`],
    ['Cement per m³', `${fmt(r.cementPerM3, 1)} kg`],
    ['Tailings per m³', `${fmt(r.tailingsPerM3, 1)} kg`],
    ['Water per m³', `${fmt(r.waterPerM3, 1)} kg`],
  ]);
});

bind('rb-form', 'rb-out', v => {
  const out = [];
  const b = C.brittleness(v.sc, v.st);
  out.push(['Brittleness B<sub>1</sub> = σ<sub>c</sub>/σ<sub>t</sub>', fmt(b.B1, 2)]);
  out.push(['Brittleness B<sub>2</sub> = (σ<sub>c</sub>−σ<sub>t</sub>)/(σ<sub>c</sub>+σ<sub>t</sub>)', fmt(b.B2, 3)]);
  if (v.stheta !== '') {
    const s = C.stressRatio(v.stheta, v.sc);
    out.push(['Stress ratio σ<sub>θ</sub>/σ<sub>c</sub> (Russenes)', `${fmt(s.ratio, 3)} ${badge(s)}`]);
  } else out.push(['Stress ratio σ<sub>θ</sub>/σ<sub>c</sub>', '<span class="muted">enter σθ</span>']);
  if (v.phisp !== '' || v.phist !== '') {
    const w = C.wetIndex(v.phisp, v.phist);
    out.push(['Elastic energy index W<sub>et</sub>', `${fmt(w.wet, 2)} ${badge(w)}`]);
  } else out.push(['Elastic energy index W<sub>et</sub>', '<span class="muted">enter Φsp and Φst</span>']);
  return rows(out);
});

bind('ir-form', 'ir-out', v => {
  const r = C.emissivityCorrect(v);
  return rows([
    ['T<sub>app</sub>', `${fmt(r.tAppK, 2)} K`],
    ['T<sub>refl</sub>', `${fmt(r.tReflK, 2)} K`],
    ['T<sub>obj</sub>', `<strong>${fmt(r.tObjC, 2)} °C</strong> (${fmt(r.tObjK, 2)} K)`],
    ['Correction', `${r.tObjC - Number(v.tAppC) >= 0 ? '+' : ''}${fmt(r.tObjC - Number(v.tAppC), 2)} °C`],
  ]);
});
