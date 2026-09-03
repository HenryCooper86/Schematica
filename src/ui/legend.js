// Bus legend: every wire draws in the same slate stroke (net_draw style); the
// pill on the wire names the bus, so the legend maps those codes to names.
import { BUSES, BUS_ORDER } from '../buses.js';
import { esc } from '../render.js';

export function initLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '<h3>Buses</h3>' + BUS_ORDER.map((id) => {
    const b = BUSES[id];
    return `<div class="legend-row"><span class="bus-chip">${esc(b.short)}</span><span>${esc(b.name)}</span></div>`;
  }).join('');
  document.getElementById('btn-legend').addEventListener('click', (e) => {
    legend.hidden = !legend.hidden;
    e.currentTarget.classList.toggle('active', !legend.hidden);
  });
}
