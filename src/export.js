import { diagramMarkup, CANVAS_BG } from './render.js';
import { contentBounds } from './geometry.js';
import { getPart } from './palette.js';
import { buildPDF } from './pdf.js';

const MARGIN = 24;

export function exportBounds(doc) {
  const b = contentBounds(doc, getPart) || { x: 0, y: 0, w: 400, h: 300 };
  return {
    x: b.x - MARGIN,
    y: b.y - MARGIN,
    w: b.w + MARGIN * 2,
    h: b.h + MARGIN * 2,
  };
}

export function buildExportSVG(doc, { transparent = false } = {}) {
  const { x, y, w, h } = exportBounds(doc);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"`
    + ` font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`
    + (transparent ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CANVAS_BG}"/>`)
    + diagramMarkup(doc)
    + '</svg>';
}

export function exportPNG(svgString, done, { scale = 2, width = null, height = null } = {}) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const kw = width ? width / img.width : scale;
    const kh = height ? height / img.height : kw;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * kw);
    canvas.height = Math.round(img.height * kh);
    const ctx = canvas.getContext('2d');
    ctx.scale(kw, kh);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => done(blob), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    done(null);
  };
  img.src = url;
}

export function exportPDF(svgString, done, { width = null } = {}) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const k = width ? width / img.width : 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    const ctx = canvas.getContext('2d');
    // JPEG has no alpha channel, so always paint the canvas ground.
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(k, k);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(async (blob) => {
      if (!blob) { done(null); return; }
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      done(new Blob(
        [buildPDF({ jpeg, width: canvas.width, height: canvas.height })],
        { type: 'application/pdf' },
      ));
    }, 'image/jpeg', 0.92);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    done(null);
  };
  img.src = url;
}

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
