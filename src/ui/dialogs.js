import { getTheme, themeBackground } from '../theme.js';
import { checkLayout } from '../layout-checks.js';
import { buildHTML } from '../html-export.js';
// File and export actions: new/save/open, the export dialog (PNG, SVG, PDF,
// seamless loop GIF), the BOM and design-rule dialogs, and share links.
import { newDoc, deleteItems, lockedKeptMessage } from '../state.js';
import { serialize, deserialize } from '../serialize.js';
import { buildExportSVG, exportBounds, exportPNG, exportPDF, download, copyPNG } from '../export.js';
import { encodeGIF } from '../gif.js';
import { LOOP_MS, esc } from '../render.js';
import { buildBOM, bomCSV, bomMarkdown, bomHeaders, bomTotalMa, bomSummary } from '../bom.js';
import { formatCurrent, formatCapacity, formatHours, powerSummary } from '../power.js';
import { checkDoc } from '../drc.js';
import { encodeShare } from '../share.js';
import { toast, openModal } from './press.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

export function initDialogs({ store }) {
  const safeName = (ext) => `${(store.doc.title || 'schematica').replace(/[^\w-]+/g, '_')}${ext}`;

  function saveJSON() {
    download(safeName('.schematica.json'), serialize(store.doc), 'application/json');
  }

  document.getElementById('btn-new').addEventListener('click', () => {
    if (confirm(tr('Clear the board? Anything not saved to a file is lost.'))) {
      store.replaceDoc(newDoc());
    }
  });
  document.getElementById('btn-save').addEventListener('click', saveJSON);
  document.getElementById('btn-remove').addEventListener('click', () => {
    // Locked items survive; say so, as the Delete key and the panel do.
    const msg = lockedKeptMessage(deleteItems(store, [...store.selection]).kept);
    if (msg) toast(msg);
  });

  // ---- Export dialog ----
  const exportDialog = document.getElementById('export-dialog');
  const exportW = document.getElementById('export-w');
  const exportH = document.getElementById('export-h');
  let exportAspect = 1;

  document.getElementById('btn-export').addEventListener('click', () => {
    const b = exportBounds(store.doc);
    exportAspect = b.w / b.h;
    exportW.value = Math.round(b.w * 2);
    exportH.value = Math.round(b.h * 2);
    openModal(exportDialog);
  });
  exportW.addEventListener('input', () => {
    if (document.getElementById('export-lock').checked) {
      exportH.value = Math.max(16, Math.round(Number(exportW.value) / exportAspect) || 16);
    }
  });
  exportH.addEventListener('input', () => {
    if (document.getElementById('export-lock').checked) {
      exportW.value = Math.max(16, Math.round(Number(exportH.value) * exportAspect) || 16);
    }
  });

  const exportOpts = (format = '') => {
    const chosen = document.getElementById('export-theme').value;
    const theme = chosen === 'current' || (chosen === 'auto' && format !== 'svg') ? getTheme() : chosen;
    return { transparent: document.getElementById('export-transparent').checked, theme };
  };
  const clampPx = (v) => Math.min(16384, Math.max(16, Math.round(Number(v)) || 16));

  document.getElementById('export-png-copy').addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try {
      await copyPNG(buildExportSVG(store.doc, exportOpts()), { width: clampPx(exportW.value), height: clampPx(exportH.value) });
      exportDialog.close(); toast(tr('PNG copied to clipboard.'));
    } catch { toast(tr('Could not copy the image. Use PNG download instead.')); }
    finally { button.disabled = false; }
  });
  document.getElementById('export-png-go').addEventListener('click', () => {
    const width = clampPx(exportW.value);
    const height = clampPx(exportH.value);
    exportDialog.close();
    exportPNG(buildExportSVG(store.doc, exportOpts()), (blob) => {
      if (blob) download(safeName('.png'), blob);
      else toast(tr('PNG export failed in this browser. The SVG export still works.'));
    }, { width, height });
  });
  document.getElementById('export-html-go').addEventListener('click', () => {
    exportDialog.close();
    download(safeName('.html'), buildHTML(store.doc, { theme: exportOpts().theme }), 'text/html');
  });
  document.getElementById('export-svg-go').addEventListener('click', () => {
    exportDialog.close();
    download(safeName('.svg'), buildExportSVG(store.doc, exportOpts('svg')), 'image/svg+xml');
  });
  document.getElementById('export-pdf-go').addEventListener('click', () => {
    const width = clampPx(exportW.value);
    exportDialog.close();
    exportPDF(buildExportSVG(store.doc, { ...exportOpts(), transparent: false }), (blob) => {
      if (blob) download(safeName('.pdf'), blob);
      else toast(tr('PDF export failed in this browser. PNG and SVG still work.'));
    }, { width, background: themeBackground(exportOpts().theme) });
  });

  // A seamless loop: LOOP_MS returns every animated attribute to its start, so
  // the last frame leads perfectly back into the first.
  let loopBusy = false;
  document.getElementById('export-gifloop-go').addEventListener('click', async () => {
    if (loopBusy) return;
    loopBusy = true;
    exportDialog.close();
    toast(tr('Rendering the seamless loop GIF…'));
    try {
      const b = exportBounds(store.doc);
      let width = Math.min(960, Math.max(16, Math.round(Number(exportW.value)) || 960));
      let height = Math.max(16, Math.round(width * (b.h / b.w)));
      if (height > 960) {
        // Tall boards get the same cap as wide ones — 60 retained frames add up.
        width = Math.max(16, Math.round(width * (960 / height)));
        height = 960;
      }
      const FRAMES = 60;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const frames = [];
      for (let i = 0; i < FRAMES; i++) {
        const svgStr = buildExportSVG(store.doc, { theme: exportOpts().theme, now: (i * LOOP_MS) / FRAMES });
        const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          ctx.drawImage(img, 0, 0, width, height);
        } finally {
          URL.revokeObjectURL(url);
        }
        frames.push({ data: ctx.getImageData(0, 0, width, height).data, width, height });
      }
      const bytes = encodeGIF(frames, { delayMs: LOOP_MS / FRAMES });
      download(safeName('.loop.gif'), new Blob([bytes], { type: 'image/gif' }), 'image/gif');
      toast(tr('Seamless loop GIF saved.'));
    } catch {
      toast(tr('Loop GIF export failed in this browser.'));
    } finally {
      loopBusy = false;
    }
  });
  document.getElementById('export-cancel').addEventListener('click', () => {
    exportDialog.close();
  });
  exportDialog.addEventListener('pointerdown', (e) => {
    if (e.target === exportDialog) exportDialog.close();
  });

  // ---- BOM dialog ----
  const bomDialog = document.getElementById('bom-dialog');
  function renderBOM() {
    const bomRows = buildBOM(store.doc);
    // A catalogue part shows its translated name; a custom part's name is the
    // user's own text and stays as typed.
    const body = bomRows.map((r) => (
      `<tr><td>${esc(r.kind === 'custom' ? r.part : trd(r.part))}</td><td>${esc(r.sublabel)}</td><td>${r.qty}</td>`
      + `<td class="wrap">${esc(r.refs.join(', '))}</td><td>${esc(r.addrs.join(', '))}</td>`
      + `<td>${esc(r.rails.join(', '))}</td><td>${esc(formatCurrent(r.currentMa))}</td><td>${esc(r.statuses.join(', '))}</td>`
      + `<td>${esc(r.flags.join(', '))}</td><td class="wrap">${esc(r.notes.join('; '))}</td></tr>`
    )).join('');
    const head = bomHeaders().map((h) => `<th>${esc(h)}</th>`).join('');
    // The board total sits in a foot row of the same shape as the lines above
    // it, and only when something on the board declared a current.
    const total = bomTotalMa(bomRows);
    const foot = total == null ? '' : `<tfoot><tr><th>${esc(tr('Board total'))}</th><th></th><th></th><th></th><th></th>`
      + `<th></th><th>${esc(formatCurrent(total))}</th><th></th><th></th><th></th></tr></tfoot>`;
    document.getElementById('bom-table').innerHTML = bomRows.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`
        + bomSummary(store.doc).map((line) => `<p class="bom-summary">${esc(line)}</p>`).join('')
      : `<p style="padding:12px">${esc(tr('The board is empty - add some parts first.'))}</p>`;
  }
  document.getElementById('btn-bom').addEventListener('click', () => {
    renderBOM();
    openModal(bomDialog);
  });
  // Rows are re-derived at click time so exports always match the live board,
  // even if it was edited (e.g. via undo) while the dialog was open.
  document.getElementById('bom-csv').addEventListener('click', () => {
    download(safeName('.bom.csv'), bomCSV(buildBOM(store.doc)), 'text/csv');
  });
  document.getElementById('bom-md').addEventListener('click', () => {
    navigator.clipboard.writeText(bomMarkdown(buildBOM(store.doc)))
      .then(() => toast(tr('Markdown table copied to clipboard.')))
      .catch(() => toast(tr('Could not access the clipboard - use Download CSV instead.')));
  });
  document.getElementById('bom-close').addEventListener('click', () => {
    bomDialog.close();
  });
  bomDialog.addEventListener('pointerdown', (e) => {
    if (e.target === bomDialog) bomDialog.close();
  });

  // ---- Design rule check ----
  const drcDialog = document.getElementById('drc-dialog');
  const levelLabel = (level) => {
    if (level === 'error') return tr('ERROR');
    return level === 'info' ? tr('INFO') : tr('WARNING');
  };
  let drcMode = 'design';
  for (const btn of document.querySelectorAll('[data-check-mode]')) btn.addEventListener('click', () => {
    drcMode = btn.dataset.checkMode;
    for (const tab of document.querySelectorAll('[data-check-mode]')) tab.setAttribute('aria-pressed', String(tab === btn));
    renderDRC();
  });
  // An info finding reports a measurement, not a defect: a runtime estimate is
  // nothing for the assistant to repair. Layout findings keep their own rule.
  const fixable = (f) => (drcMode === 'design' ? f.level !== 'info' : !!f.supportedFixes?.length);

  // The power tree, read-only: the rails exactly as power.js builds them, with
  // no judgement of any kind. The Design rules tab is where a number is called
  // wrong; this one is where a reader simply sees what the board adds up to.
  function renderPower() {
    const list = document.getElementById('drc-list');
    const rails = powerSummary(store.doc);
    if (!rails.length) {
      list.innerHTML = `<p class="drc-clean">${esc(tr('No power wires are drawn, so there are no rails to total up.'))}</p>`;
      return;
    }
    const dash = '—';
    const rows = rails.map((r, i) => {
      const facts = [
        [tr('Supply'), r.sources.length ? r.sources.join(tr(' and ')) : tr('none drawn')],
        // A rail fed by several supplies shows their limits added up, which is
        // an upper bound and not a promise that they share the load.
        [r.sources.length > 1 ? tr('Limits together') : tr('Limit'), r.limitMa == null ? dash
          : formatCurrent(r.limitMa) + (r.limitComplete ? '' : ` ${tr('(partly undeclared)')}`)],
        [tr('Typical'), r.summed ? formatCurrent(r.typicalMa) : dash],
        [tr('Peak'), r.summed ? formatCurrent(r.peakMa) : dash],
      ];
      for (const p of r.passes) facts.push([tr('In series'), `${p.label}${p.limitMa == null ? '' : ` · ${formatCurrent(p.limitMa)}`}`]);
      if (r.undeclared.length) facts.push([tr('Declares nothing'), r.undeclared.join(', ')]);
      // The cell is named, because a rail may be fed by more than one of them.
      for (const rt of r.runtimes) {
        facts.push([tr('Runtime'), `${rt.label} · ${tr('{capacity} at a continuous {draw} is about {hours} h', {
          capacity: formatCapacity(rt.capacityMah), draw: formatCurrent(r.typicalMa), hours: formatHours(rt.hours),
        })}`]);
      }
      const body = facts.map(([k, v]) => `<div class="power-fact"><b>${esc(k)}</b> ${esc(v)}</div>`).join('');
      return `<div class="drc-row"><span class="msg">${body}</span><button data-power="${i}">${esc(tr('Select'))}</button></div>`;
    }).join('');
    list.innerHTML = rows;
    list.querySelectorAll('[data-power]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setSelection(rails[Number(btn.dataset.power)].ids);
        drcDialog.close();
      });
    });
  }

  function renderDRC() {
    if (drcMode === 'power') { renderPower(); return; }
    const findings = drcMode === 'layout' ? checkLayout(store.doc) : checkDoc(store.doc);
    const list = document.getElementById('drc-list');
    if (!findings.length) {
      list.innerHTML = `<p class="drc-clean">${esc(drcMode === 'layout' ? tr('No layout issues found.') : tr('No issues found - the board passes every check.'))}</p>`;
      return;
    }
    list.innerHTML = (drcMode === 'layout' && findings.length === 200 ? `<p>${esc(tr('Showing the first 200 layout findings. Resolve some and check again.'))}</p>` : '') + findings.map((f, i) => (
      `<div class="drc-row"><span class="drc-level ${f.level}">${esc(levelLabel(f.level))}</span>`
      + `<span class="msg">${esc(f.message)}${f.suggestion ? `<small>${esc(f.suggestion)}</small>` : ''}</span>`
      + `<button data-drc="${i}">${esc(tr('Select'))}</button>${fixable(f) ? `<button data-drc-fix="${i}">${esc(tr('Fix'))}</button>` : ''}</div>`
    )).join('');
    list.querySelectorAll('[data-drc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setSelection(findings[Number(btn.dataset.drc)].ids);
        drcDialog.close();
      });
    });
    // Fix hands the finding to the assistant panel, which owns the request.
    list.querySelectorAll('[data-drc-fix]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const finding = findings[Number(btn.dataset.drcFix)];
        drcDialog.close();
        document.dispatchEvent(new CustomEvent('schematica:fix-finding', { detail: finding }));
      });
    });
  }
  document.getElementById('btn-check').addEventListener('click', () => {
    renderDRC();
    openModal(drcDialog);
  });
  document.getElementById('drc-close').addEventListener('click', () => {
    drcDialog.close();
  });
  drcDialog.addEventListener('pointerdown', (e) => {
    if (e.target === drcDialog) drcDialog.close();
  });

  onLanguageChange(() => {
    if (bomDialog.open) renderBOM();
    if (drcDialog.open) renderDRC();
  });

  // ---- Share link ----
  document.getElementById('btn-share').addEventListener('click', async () => {
    try {
      const fragment = await encodeShare(store.doc);
      const url = `${location.origin}${location.pathname}#${fragment}`;
      await navigator.clipboard.writeText(url);
      toast(tr('Share link copied to clipboard ({n} characters).', { n: url.length.toLocaleString() }));
    } catch {
      toast(tr('Could not copy the share link - your browser blocked clipboard access.'));
    }
  });

  // ---- Open a file ----
  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { doc, warnings } = deserialize(await file.text());
      store.replaceDoc(doc);
      if (warnings.length) toast(tr('Opened with warnings:\n\n{list}', { list: warnings.join('\n') }));
    } catch (err) {
      toast(err.message);
    }
  });

  return { saveJSON };
}
