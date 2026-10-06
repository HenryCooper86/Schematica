// Synthetic contracts for learning the declared-data checker. None of these
// values are sourced from a vendor, a bus standard, or a hardware measurement.
const contracts = [
  { bus: 'power', name: 'Declared Power Reference', first: 'Example supply', rest: 'Example load', min: 3, max: 3.6,
    source: 'Illustrative POWER-REF-1 assumptions: one 3.0–3.6 V supply, four loads accepting that interval, shared 0 V reference. Current, transient response, protection and wiring resistance are unspecified and not checked. Not vendor specifications or measured hardware.',
    scope: 'Power and ground declarations cover voltage and direction only. This board intentionally makes no current-capacity or safety claim. Real supplies and loads need their own verified sources.' },
  { bus: 'i2c', name: 'Declared I2C Reference', first: 'Example controller', rest: 'Example peripheral', min: 3, max: 3.6, rate: 100000, protocol: 'I2C',
    source: 'Illustrative I2C-REF-1 assumptions: aggregated SDA/SCL interface, 3.0–3.6 V declared logic envelope, bidirectional traffic at 100000 bit/s, unique peripheral addresses 0x20–0x23. Pull-ups, capacitance, timing and module supplies are outside this contract. Not vendor specifications or measured hardware.',
    scope: 'Each line represents an aggregated SDA/SCL connection on one logical I2C bus. Unique addresses are declared. Pull-up values, rise time, wiring capacitance and supplies still require hardware design and validation.' },
  { bus: 'can', name: 'Declared CAN Reference', first: 'Example CAN module 1', rest: 'Example CAN module', min: 0, max: 5, rate: 500000, protocol: 'CAN',
    source: 'Illustrative CAN-REF-1 assumptions: aggregated CAN H/L module interface, synthetic 0–5 V envelope and 500000 bit/s capacity on all modules. This envelope is not a CAN physical-layer specification. Termination, transceiver behavior, timing and supplies are outside this contract. Not vendor specifications or measured hardware.',
    scope: 'Each line represents a logical segment of an aggregated CAN H/L bus. The synthetic voltage envelope only demonstrates the range checker. Termination, physical routing, transceiver choice and timing must be validated separately.' },
];

function teachingExample(c) {
  const title = c.name, power = c.bus === 'power';
  const capability = direction => ({ direction, voltageMinV: c.min, voltageMaxV: c.max,
    ...(power ? {} : { rateBps: c.rate }), protocols: power ? [] : [c.protocol], source: c.source });
  const ground = { direction: 'passive', voltageMinV: 0, voltageMaxV: 0, protocols: [], source: c.source };
  const nodes = Array.from({ length: 5 }, (_, i) => ({
    id: `n${i + 1}`, kind: 'custom', x: 60 + i * 260, y: i % 2 ? 260 : 100,
    label: i ? `${c.rest} ${power || c.bus === 'i2c' ? i : i + 1}` : c.first,
    sublabel: '', color: null, addr: c.bus === 'i2c' && i ? `0x${(31 + i).toString(16)}` : '', rail: '', notes: c.scope, status: null, flags: [],
    part: { name: 'Illustrative interface module', category: 'compute', accent: '#60a5fa', icon: { text: 'IF' },
      ports: [{ id: 'bus', name: c.bus.toUpperCase(), bus: c.bus, side: i ? 'left' : 'right', required: false },
        ...(power ? [{ id: 'ground', name: 'GND', bus: 'gnd', side: 'bottom', required: false }] : [])], fields: [] },
    interfacePorts: { bus: capability(power ? i ? 'input' : 'output' : 'bidirectional'), ...(power ? { ground: { ...ground } } : {}) },
  }));
  const wires = nodes.slice(1).flatMap((n, i) => {
    const origin = c.bus === 'can' ? nodes[i] : nodes[0];
    const wire = { id: `w${i + 1}`, bus: c.bus, from: { node: origin.id, port: 'bus' }, to: { node: n.id, port: 'bus' },
      label: c.bus.toUpperCase(), arrow: power ? 'fwd' : 'both', style: null, flow: null,
      spec: { direction: power ? 'from-to' : 'bidirectional', voltage: `${c.min}–${c.max} V`, protocol: power ? '' : c.protocol,
        rate: power ? '' : `${c.rate} bit/s`, source: c.source, voltageMinV: c.min, voltageMaxV: c.max, ...(power ? {} : { rateBps: c.rate }) } };
    return [wire, ...(power ? [{ id: `g${i + 1}`, bus: 'gnd', from: { node: 'n1', port: 'ground' }, to: { node: n.id, port: 'ground' }, label: 'GND', arrow: 'both', style: null, flow: null,
      spec: { direction: 'bidirectional', voltage: '0 V', protocol: '', rate: '', source: c.source, voltageMinV: 0, voltageMaxV: 0 } }] : [])];
  });
  return { id: `declared-${c.bus}-reference`, name: title, group: 'Embedded', doc: { schema: 4, title, nodes, wires,
    zones: [{ id: 'z1', x: 30, y: 40, w: 1300, h: 470, label: 'Illustrative interface contract', color: '#60a5fa' }],
    notes: [{ id: 't1', x: 60, y: 550, text: c.scope }],
    journey: [
      { id: 'j1', label: 'Read the assumptions', view: { cx: 630, cy: 280, zoom: 0.7 }, caption: c.scope },
      { id: 'j2', label: 'Inspect declarations', view: { cx: 320, cy: 240, zoom: 1 }, caption: 'Open Engineering → Interfaces to compare the connection limits with both endpoints and read their illustrative source.' },
      { id: 'j3', label: 'Check and challenge', view: { cx: 850, cy: 240, zoom: 0.8 }, caption: power ? 'Run checks, then lower a load voltage maximum below the required range. The declared voltage conflict blocks readiness. Current capacity remains outside these checks.' : 'Run checks, then lower an endpoint rate below the required connection rate. The real bandwidth finding blocks readiness; restore the declaration to recover.' },
    ] } };
}

export const TEACHING_EXAMPLES = contracts.map(teachingExample);
