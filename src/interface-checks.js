// Optional declared interface limits. Missing data never becomes a compatibility claim.
import { tr } from './i18n.js';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
export function normalizeConstraints(raw) {
  const out = {};
  for (const key of ['voltageMinV', 'voltageMaxV', 'rateBps']) {
    if (typeof raw?.[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key];
  }
  return out;
}
export function normalizeCapability(raw) {
  if (!object(raw)) return undefined;
  const out = normalizeConstraints(raw);
  out.direction = ['input', 'output', 'bidirectional', 'passive'].includes(raw.direction)
    ? raw.direction
    : '';
  out.protocols = Array.isArray(raw.protocols)
    ? [
        ...new Set(
          raw.protocols
            .filter((p) => typeof p === 'string')
            .map((p) => p.trim().slice(0, 100))
            .filter(Boolean),
        ),
      ].slice(0, 32)
    : [];
  out.source = typeof raw.source === 'string' ? raw.source.slice(0, 20000) : '';
  return out;
}
export function normalizeInterfacePorts(raw) {
  if (!object(raw)) return undefined;
  const entries = Object.entries(raw)
    .slice(0, 64)
    .filter(([id, value]) => /^[\w-]{1,24}$/.test(id) && object(value))
    .map(([id, value]) => [id, normalizeCapability(value)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function resolveInterfaceEndpoint(doc, ref) {
  const node = doc.nodes.find((n) => n.id === ref.node);
  const exposed = node?.subsystem?.exposed.find((p) => p.port === ref.port);
  if (exposed)
    return resolveInterfaceEndpoint(node.subsystem.doc, {
      node: exposed.node,
      port: exposed.childPort,
    });
  return { node, port: ref.port, capability: node?.interfacePorts?.[ref.port] };
}
const range = (v) => Number.isFinite(v?.voltageMinV) && Number.isFinite(v?.voltageMaxV);
const valid = (v) =>
  ['voltageMinV', 'voltageMaxV', 'rateBps'].every(
    (k) => v?.[k] === undefined || Number.isFinite(v[k]),
  ) &&
  (!range(v) || v.voltageMaxV >= v.voltageMinV) &&
  (v?.rateBps === undefined || v.rateBps > 0);
const contains = (outer, inner) =>
  outer.voltageMinV <= inner.voltageMinV && outer.voltageMaxV >= inner.voltageMaxV;
export function interfaceCompatibility(doc) {
  const findings = [];
  for (const wire of doc.wires) {
    const spec = wire.spec || {},
      a = resolveInterfaceEndpoint(doc, wire.from).capability,
      b = resolveInterfaceEndpoint(doc, wire.to).capability;
    if (!a && !b && !Object.keys(normalizeConstraints(spec)).length) continue;
    const ids = [wire.id, wire.from.node, wire.to.node];
    const add = (rule, level, message) =>
      findings.push({
        rule,
        level,
        ids,
        message: tr('Interface {id}: {detail}', { id: wire.id, detail: message }),
      });
    if (![spec, a, b].every(valid)) {
      add('interface-invalid', 'error', tr('Declared interface limits are invalid.'));
      continue;
    }
    const direction =
      spec.direction || { fwd: 'from-to', back: 'to-from', both: 'bidirectional' }[wire.arrow];
    const required =
      direction === 'from-to'
        ? ['output', 'input']
        : direction === 'to-from'
          ? ['input', 'output']
          : direction === 'bidirectional'
            ? ['bidirectional', 'bidirectional']
            : null;
    if (
      required &&
      [a, b].some(
        (c, i) => c?.direction && ![required[i], 'bidirectional', 'passive'].includes(c.direction),
      )
    )
      add(
        'interface-direction',
        'error',
        tr('Connection direction conflicts with a declared endpoint direction.'),
      );
    if (range(spec)) {
      for (const [i, c] of [a, b].entries())
        if (range(c) && !contains(c, spec))
          add(
            'interface-voltage',
            'error',
            tr('The connection voltage range exceeds endpoint {endpoint} limits.', {
              endpoint: i + 1,
            }),
          );
    } else if (range(a) && range(b)) {
      const compatible =
        direction === 'from-to'
          ? contains(b, a)
          : direction === 'to-from'
            ? contains(a, b)
            : direction === 'bidirectional'
              ? contains(a, b) && contains(b, a)
              : Math.max(a.voltageMinV, b.voltageMinV) <= Math.min(a.voltageMaxV, b.voltageMaxV);
      if (!compatible)
        add(
          'interface-voltage',
          'error',
          tr('The declared endpoint voltage ranges are incompatible.'),
        );
    }
    for (const [i, c] of [a, b].entries()) {
      if (spec.rateBps !== undefined && c?.rateBps !== undefined && spec.rateBps > c.rateBps)
        add(
          'interface-bandwidth',
          'error',
          tr('Required bandwidth exceeds endpoint {endpoint} capacity.', { endpoint: i + 1 }),
        );
      if (
        spec.protocol?.trim() &&
        c?.protocols?.length &&
        !c.protocols.some((p) => p.toLowerCase() === spec.protocol.trim().toLowerCase())
      )
        add(
          'interface-protocol',
          'error',
          tr('The protocol is not supported by endpoint {endpoint}.', { endpoint: i + 1 }),
        );
    }
    if (
      !spec.protocol?.trim() &&
      a?.protocols?.length &&
      b?.protocols?.length &&
      !a.protocols.some((p) => b.protocols.some((q) => p.toLowerCase() === q.toLowerCase()))
    )
      add('interface-protocol', 'error', tr('The declared endpoints have no common protocol.'));
    const missing = missingInterfaceDeclarations(doc, wire);
    if (missing.length)
      add(
        'interface-unknown',
        'info',
        tr('Compatibility is incomplete: {fields}.', { fields: missing.join(', ') }),
      );
  }
  return findings;
}

// Coverage and compatibility use the same completeness requirements. Power/ground
// need direction, voltage ranges and sources, not a made-up protocol or bit rate.
export function missingInterfaceDeclarations(doc, wire) {
  const spec = wire.spec || {};
  const a = resolveInterfaceEndpoint(doc, wire.from).capability;
  const b = resolveInterfaceEndpoint(doc, wire.to).capability;
  const direction = spec.direction || { fwd: 'from-to', back: 'to-from', both: 'bidirectional' }[wire.arrow];
  const signal = !['power', 'gnd'].includes(wire.bus);
  const missing = [];
  if (!direction) missing.push(tr('connection direction'));
  for (const [i, c] of [a, b].entries()) {
    if (
      !c?.direction ||
      !range(c) ||
      (signal && c?.rateBps === undefined) ||
      (signal && !c?.protocols?.length) ||
      !c?.source?.trim()
    )
      missing.push(tr('endpoint {endpoint} declarations', { endpoint: i + 1 }));
  }
  if (
    !range(spec) ||
    (signal && spec.rateBps === undefined) ||
    (signal && !spec.protocol?.trim()) ||
    !spec.source?.trim()
  )
    missing.push(tr('connection limits and source'));
  return missing;
}
