import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPDF } from '../src/pdf.js';

const fakeJpeg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 0xFF, 0xD9]);
const td = new TextDecoder('latin1');

test('buildPDF produces a structurally valid single-page PDF', () => {
  const bytes = buildPDF({ jpeg: fakeJpeg, width: 800, height: 600 });
  const text = td.decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.ok(text.includes('/MediaBox [0 0 800 600]'));
  assert.ok(text.includes('/Filter /DCTDecode'));
  assert.ok(text.includes(`/Length ${fakeJpeg.length} >>`));
  assert.ok(text.includes('/Im0 Do'));
});

test('xref offsets point at the right objects', () => {
  const bytes = buildPDF({ jpeg: fakeJpeg, width: 320, height: 240 });
  const text = td.decode(bytes);
  const startxref = Number(text.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const entries = [...text.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 5);
  entries.forEach((off, i) => {
    assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} offset`);
  });
});

test('the JPEG bytes are embedded verbatim', () => {
  const bytes = buildPDF({ jpeg: fakeJpeg, width: 10, height: 10 });
  const hay = td.decode(bytes);
  const needle = td.decode(fakeJpeg);
  assert.ok(hay.includes(needle));
});

test('rejects missing image data or bad dimensions', () => {
  assert.throws(() => buildPDF({ jpeg: new Uint8Array(0), width: 10, height: 10 }), /image/);
  assert.throws(() => buildPDF({ jpeg: fakeJpeg, width: 0, height: 10 }), /dimensions/);
});
