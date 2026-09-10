// Bill of materials: pure derivation from a document; the column headers and
// the catalogue part names are language-dependent.

import { partOf } from './custom.js';
import { partCurrents, powerRails, runtimeHours, declaredTypicalMa, formatCurrent, formatCapacity, formatHours } from './power.js';
import { tr, trd } from './i18n.js';

export const bomHeaders = () => [tr('Part'), tr('Part number'), tr('Qty'), tr('Refs'), tr('Addresses'), tr('Rails'), tr('Typ. current'), tr('Status'), tr('Flags'), tr('Notes')];

// A catalogue part shows its translated name; a custom part's name is the
// user's own text and stays as typed. The dialog shows the same thing, so an
// export always matches the table it was taken from.
const partName = (row) => (row.kind === 'custom' ? row.part : trd(row.part));

export function buildBOM(doc) {
  const groups = new Map();
  for (const node of doc.nodes) {
    const part = partOf(node);
    // Copies of one library template are one line; a one-off groups by name.
    const key = part.custom ? `custom:${part.lib || part.name}|${node.sublabel}` : `${node.kind}|${node.sublabel}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        part: part.name,
        kind: node.kind,
        sublabel: node.sublabel,
        qty: 0,
        refs: [],
        addrs: [],
        rails: [],
        // The line's typical current: the sum over its copies, so the column
        // adds up to the board total. Null while no copy has declared one -
        // "not stated" is not the same as "draws nothing".
        currentMa: null,
        statuses: [],
        flags: [],
        notes: [],
      };
      groups.set(key, g);
    }
    g.qty += 1;
    const { typicalMa, peakMa } = partCurrents(node);
    const ma = typicalMa ?? peakMa;
    if (ma != null) g.currentMa = (g.currentMa ?? 0) + ma;
    g.refs.push(node.label);
    if (node.addr) g.addrs.push(node.addr);
    if (node.rail && !g.rails.includes(node.rail)) g.rails.push(node.rail);
    if (node.status && !g.statuses.includes(node.status)) g.statuses.push(node.status);
    for (const f of node.flags || []) {
      if (!g.flags.includes(f)) g.flags.push(f);
    }
    if (node.notes) g.notes.push(node.notes);
  }
  return [...groups.values()].sort(
    (a, b) => a.part.localeCompare(b.part) || a.sublabel.localeCompare(b.sublabel),
  );
}

// A cell that a spreadsheet would evaluate as a formula (leading = + - @, or
// a tab or return that lets one hide behind whitespace) is prefixed with an
// apostrophe, the convention spreadsheets read as "this is text", and quoted
// so the apostrophe survives the CSV parser.
function csvCell(v) {
  const s = String(v ?? '');
  const formula = /^[=+\-@\t\r]/.test(s);
  const text = formula ? `'${s}` : s;
  return formula || /[",\n\r]/.test(s) ? `"${text.replace(/"/g, '""')}"` : text;
}

// What the board declares it draws, across every line. Null when no part on
// the board states a current at all, in which case no total row is written.
export function bomTotalMa(rows) {
  let total = null;
  for (const r of rows) if (r.currentMa != null) total = (total ?? 0) + r.currentMa;
  return total;
}

// The total row, or null. It carries the label in the Part column and the sum
// in the current column, so a spreadsheet reading the file sees one more row
// of the same shape rather than a free-text footer.
function totalCells(rows) {
  const total = bomTotalMa(rows);
  if (total == null) return null;
  return [tr('Board total'), '', '', '', '', '', formatCurrent(total), '', '', ''];
}

export function bomCSV(rows) {
  const lines = [bomHeaders().map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      partName(r), r.sublabel, r.qty, r.refs.join('; '), r.addrs.join('; '),
      r.rails.join('; '), formatCurrent(r.currentMa), r.statuses.join('; '), r.flags.join('; '), r.notes.join(' | '),
    ].map(csvCell).join(','));
  }
  const total = totalCells(rows);
  if (total) lines.push(total.map(csvCell).join(','));
  return lines.join('\n');
}

export function bomMarkdown(rows) {
  const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
  const lines = [
    `| ${bomHeaders().join(' | ')} |`,
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| ${cell(partName(r))} | ${cell(r.sublabel)} | ${r.qty} | ${cell(r.refs.join(', '))}`
      + ` | ${cell(r.addrs.join(', '))} | ${cell(r.rails.join(', '))} | ${cell(formatCurrent(r.currentMa))}`
      + ` | ${cell(r.statuses.join(', '))} | ${cell(r.flags.join(', '))}`
      + ` | ${cell(r.notes.join('; '))} |`);
  }
  const total = totalCells(rows);
  if (total) lines.push(`| ${total.map(cell).join(' | ')} |`);
  return lines.join('\n');
}

// The lines under the table: what the board declares it draws, and how long
// each cell that states a capacity would last on the rail it feeds. Both are
// arithmetic on declared figures, not a model of the board's behaviour.
export function bomSummary(doc) {
  const lines = [];
  const total = declaredTypicalMa(doc.nodes);
  if (total != null) lines.push(tr('Declared typical current: {total}.', { total: formatCurrent(total) }));
  for (const rail of powerRails(doc)) {
    for (const source of rail.sources) {
      const hours = runtimeHours(source.currents.capacityMah, rail.typicalMa);
      if (hours == null) continue;
      lines.push(tr('{label} at {capacity}: about {hours} h at a continuous {draw}, ignoring duty cycle and efficiency.', {
        label: source.node.label,
        capacity: formatCapacity(source.currents.capacityMah),
        hours: formatHours(hours),
        draw: formatCurrent(rail.typicalMa),
      }));
    }
  }
  return lines;
}
