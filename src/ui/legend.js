// The bus legend: a floating list of bus codes and names. The chip on a
// wire's pill names the bus by code, so the legend maps codes to names.
import { BUSES, BUS_ORDER } from '../buses.js';
import { tr, trd, onLanguageChange } from '../i18n.js';
import { escAttr as esc } from './press.js';

export function initLegend() {
  const legend = document.getElementById('legend');
  function renderLegend() {
    legend.innerHTML = `<h3>${esc(tr('Buses'))}</h3>` + BUS_ORDER.map((id) => {
      const b = BUSES[id];
      return `<div class="legend-row"><span class="bus-chip">${esc(b.short)}</span><span>${esc(trd(b.name))}</span></div>`;
    }).join('');
  }
  renderLegend();
  document.getElementById('btn-legend').addEventListener('click', (e) => {
    legend.hidden = !legend.hidden;
    e.currentTarget.classList.toggle('active', !legend.hidden);
    e.currentTarget.setAttribute('aria-pressed', String(!legend.hidden));
  });
  onLanguageChange(renderLegend);
}
