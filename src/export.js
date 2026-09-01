import { diagramMarkup, CANVAS_BG } from './render.js';
import { contentBounds } from './geometry.js';
import { getPart } from './palette.js';

const MARGIN = 24;

export function buildExportSVG(doc) {
  const b = contentBounds(doc, getPart) || { x: 0, y: 0, w: 400, h: 300 };
  const x = b.x - MARGIN;
  const y = b.y - MARGIN;
  const w = b.w + MARGIN * 2;
  const h = b.h + MARGIN * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"`
    + ` font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CANVAS_BG}"/>`
    + diagramMarkup(doc)
    + '</svg>';
}

export function exportPNG(svgString, done, scale = 2) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
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

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
