// Design-rule checker: pure derivation from a document. Zero dependencies.
// Findings: { level: 'error'|'warning', rule, message, ids: [nodeOrWireIds] }.

import { getPart } from './palette.js';

function i2cComponents(doc) {
  // Connected components over nodes joined by i2c-bus wires.
  const parent = new Map();
  const find = (a) => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  for (const w of doc.wires) {
    if (w.bus === 'i2c') union(w.from.node, w.to.node);
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()];
}

export function checkDoc(doc) {
  const findings = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const wiredPorts = new Set();
  const wiredNodes = new Set();
  for (const w of doc.wires) {
    wiredPorts.add(`${w.from.node}|${w.from.port}`);
    wiredPorts.add(`${w.to.node}|${w.to.port}`);
    wiredNodes.add(w.from.node);
    wiredNodes.add(w.to.node);
  }

  // 1. I2C address conflicts within one net.
  for (const component of i2cComponents(doc)) {
    const byAddr = new Map();
    for (const id of component) {
      const n = byId.get(id);
      if (n && n.addr) {
        if (!byAddr.has(n.addr)) byAddr.set(n.addr, []);
        byAddr.get(n.addr).push(n);
      }
    }
    for (const [addr, nodes] of byAddr) {
      if (nodes.length > 1) {
        findings.push({
          level: 'error',
          rule: 'i2c-addr-conflict',
          message: `I2C address ${addr} is used by ${nodes.map((n) => n.label).join(' and ')} on the same bus.`,
          ids: nodes.map((n) => n.id),
        });
      }
    }
  }

  // 2. Unconnected VCC/GND pins (consumption pins only).
  for (const n of doc.nodes) {
    for (const port of getPart(n.kind).ports) {
      if ((port.bus === 'power' || port.bus === 'gnd')
        && (port.id === 'vcc' || port.id === 'gnd' || port.id.startsWith('vin'))
        && !wiredPorts.has(`${n.id}|${port.id}`)) {
        findings.push({
          level: 'warning',
          rule: 'unconnected-power',
          message: `${n.label}'s ${port.name} pin is unconnected.`,
          ids: [n.id],
        });
      }
    }
  }

  // 3. Fully floating nodes.
  const floating = doc.nodes.filter((n) => !wiredNodes.has(n.id));
  if (floating.length) {
    findings.push({
      level: 'warning',
      rule: 'floating-node',
      message: `${floating.map((n) => n.label).join(', ')} ${floating.length === 1 ? 'is' : 'are'} not wired to anything.`,
      ids: floating.map((n) => n.id),
    });
  }

  // 4. Wire bus matches neither endpoint's port bus.
  for (const w of doc.wires) {
    const busOf = (ref) => {
      const n = byId.get(ref.node);
      return n ? getPart(n.kind).ports.find((p) => p.id === ref.port)?.bus : undefined;
    };
    const ends = [busOf(w.from), busOf(w.to)];
    if (ends[0] !== undefined && ends[1] !== undefined && !ends.includes(w.bus)) {
      findings.push({
        level: 'warning',
        rule: 'bus-mismatch',
        message: `A ${w.bus.toUpperCase()} wire connects ports that are ${ends.map((b) => String(b).toUpperCase()).join(' and ')}.`,
        ids: [w.id],
      });
    }
  }

  // 5. Lifecycle risks: deprecated status or EOL flag in the design.
  for (const n of doc.nodes) {
    if (n.status === 'deprecated' || (n.flags || []).includes('eol')) {
      findings.push({
        level: 'warning',
        rule: 'lifecycle',
        message: `${n.label} is ${n.status === 'deprecated' ? 'marked deprecated' : 'flagged end-of-life'}.`,
        ids: [n.id],
      });
    }
  }

  const order = { error: 0, warning: 1 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
