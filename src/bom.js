// Bill of materials: pure derivation from a document. Zero dependencies.

import { getPart } from './palette.js';

export function buildBOM(doc) {
  const groups = new Map();
  for (const node of doc.nodes) {
    const part = getPart(node.kind);
    const key = `${node.kind}|${node.sublabel}`;
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
        statuses: [],
        flags: [],
        notes: [],
      };
      groups.set(key, g);
    }
    g.qty += 1;
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

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function bomCSV(rows) {
  const lines = ['Part,Part number,Qty,Refs,Addresses,Rails,Status,Flags,Notes'];
  for (const r of rows) {
    lines.push([
      r.part, r.sublabel, r.qty, r.refs.join('; '), r.addrs.join('; '),
      r.rails.join('; '), r.statuses.join('; '), r.flags.join('; '), r.notes.join(' | '),
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function bomMarkdown(rows) {
  const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
  const lines = [
    '| Part | Part number | Qty | Refs | Addresses | Rails | Status | Flags | Notes |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| ${cell(r.part)} | ${cell(r.sublabel)} | ${r.qty} | ${cell(r.refs.join(', '))}`
      + ` | ${cell(r.addrs.join(', '))} | ${cell(r.rails.join(', '))}`
      + ` | ${cell(r.statuses.join(', '))} | ${cell(r.flags.join(', '))}`
      + ` | ${cell(r.notes.join('; '))} |`);
  }
  return lines.join('\n');
}
