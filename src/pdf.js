// Minimal single-page PDF builder: one JPEG image scaled to the page.
// Pure byte assembly, zero dependencies (PDF 1.4, /DCTDecode passthrough).

const te = new TextEncoder();

export function buildPDF({ jpeg, width, height }) {
  if (!jpeg || !jpeg.length) throw new Error('buildPDF: no image data');
  if (!(width > 0) || !(height > 0)) throw new Error('buildPDF: bad dimensions');

  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = (data) => {
    const bytes = typeof data === 'string' ? te.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const obj = (i, body) => {
    offsets[i] = offset;
    push(`${i} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]`
    + ' /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = offset;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height}`
    + ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${te.encode(content).length} >>\nstream\n${content}\nendstream`);

  const xrefStart = offset;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
