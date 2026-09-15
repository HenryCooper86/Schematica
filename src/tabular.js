export function csvCell(value) {
  const s = String(value ?? '');
  const formula = /^[=+\-@\t\r]/.test(s);
  const safe = formula ? `'${s}` : s;
  return formula || /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export const toCSV = rows => rows.map(row => row.map(csvCell).join(',')).join('\n');
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting');
      cell += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV cell');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}
