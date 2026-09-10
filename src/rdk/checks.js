// Pure, source-aware architectural checks. Unknown metadata is never support.
import { profileFor } from './profiles.js';
import { PARTS } from '../palette.js';
import { tr, trd } from '../i18n.js';

const refs = (w) => [
  [w.from, w.to],
  [w.to, w.from],
];
const sources = (...profiles) =>
  [
    ...new Set(profiles.flatMap((p) => (p?.sources || []).map((s) => s.url))),
  ].join(' ');
const requirements = (...profiles) =>
  [...new Set(profiles.flatMap((p) => p?.requirements || []))].map(trd).join(' ');
// Optional trailing parts (requirements, sources) may be empty: no double spaces.
const sentence = (...parts) => parts.filter(Boolean).join(' ');
// Kinds whose only power port is an output (battery, jack, solar, vbat...):
// their rail describes what they deliver. Anything with a power input
// (regulator, charger, fuse) may describe its input instead.
const SUPPLY_KINDS = new Set(
  Object.values(PARTS)
    .filter((part) => {
      const power = part.ports.filter((port) => port.bus === 'power');
      return power.length && power.every((port) => port.id === 'out');
    })
    .map((part) => part.kind),
);
const isBoard = (n) => n?.kind === 'aisbc';
const isCamera = (n) => ['mipicam', 'depthcam'].includes(n?.kind);
const voltage = (value) => {
  const m = String(value || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*V?(?:\s*[-–]\s*(\d+(?:\.\d+)?)\s*V)?$/i);
  // Require a voltage unit; bare numbers are not declared voltages.
  if (!m || !/v/i.test(value)) return null;
  const a = Number(m[1]),
    b = Number(m[2] || m[1]);
  return a <= b ? [a, b] : null;
};

// cameraOccupancy(doc, node) -> [{port, endpoints:[{node,port}], wireIds}].
// Only documented board CSI ports count; duplicate edges share an endpoint.
export function cameraOccupancy(doc, node) {
  const profile = profileFor(node);
  if (!isBoard(node) || !profile?.ports) return [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  return profile.ports
    .filter((p) => p.bus === 'mipi')
    .map((port) => {
      const endpoints = new Map(),
        wireIds = [];
      for (const w of doc.wires)
        for (const [own, other] of refs(w)) {
          if (
            own.node !== node.id ||
            own.port !== port.id ||
            !isCamera(byId.get(other.node))
          )
            continue;
          endpoints.set(`${other.node}|${other.port}`, other);
          wireIds.push(w.id);
        }
      return { port: port.id, endpoints: [...endpoints.values()], wireIds };
    });
}

export function checkRdk(doc) {
  const findings = [],
    byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const add = (level, rule, message, ids) =>
    findings.push({ level, rule, message, ids: [...new Set(ids)] });
  for (const n of doc.nodes) {
    const p = profileFor(n);
    if (p && !p.ports) {
      add(
        'warning',
        'rdk-interface',
        sentence(tr('{label}: connector profile is unverified.', { label: n.label }), requirements(p), sources(p)),
        [n.id],
      );
    }
    for (const slot of cameraOccupancy(doc, n))
      if (slot.endpoints.length > 1) {
        add(
          'error',
          'rdk-csi-capacity',
          tr('{label} {port} is shared by multiple camera inputs.', { label: n.label, port: slot.port }),
          [n.id, ...slot.endpoints.map((e) => e.node), ...slot.wireIds],
        );
      }
    // Known stereo cameras declare their two actual camera-side CSI ports.
    const stereoPorts = isCamera(n)
      ? p?.ports?.filter((port) => port.bus === 'mipi')
      : null;
    if (stereoPorts?.length === 2) {
      const links = stereoPorts.map((port) => {
        const unique = new Map();
        for (const w of doc.wires)
          for (const [own, other] of refs(w)) {
            if (own.node === n.id && own.port === port.id)
              unique.set(`${other.node}|${other.port}`, { other, wire: w });
          }
        return [...unique.values()];
      });
      const all = links.flat(),
        ids = [n.id, ...all.flatMap((l) => [l.other.node, l.wire.id])];
      const endpoints = all.map((l) => l.other),
        hosts = endpoints.map((e) => byId.get(e.node));
      const malformed =
        links.some((l) => l.length !== 1) ||
        hosts.some((h) => !isBoard(h)) ||
        endpoints[0]?.node !== endpoints[1]?.node ||
        endpoints[0]?.port === endpoints[1]?.port ||
        endpoints.some(
          (e, i) =>
            profileFor(hosts[i])?.ports &&
            !profileFor(hosts[i]).ports.some(
              (p) => p.id === e.port && p.bus === 'mipi',
            ),
        ) ||
        all.some((l) => l.wire.bus !== 'mipi');
      // A camera with no wires at all is reported by the floating-node rule.
      const wired = all.length > 0;
      if (wired && malformed)
        add(
          'error',
          'rdk-stereo-links',
          tr('{label} requires left and right MIPI links to two distinct supported CSI connectors on the same board. {sources}', { label: n.label, sources: sources(p) }),
          ids,
        );
      else if (hosts.some((h) => !profileFor(h)?.ports))
        add(
          'warning',
          'rdk-stereo-links',
          sentence(tr('{label}: stereo connector pair is unverified.', { label: n.label }), requirements(p, ...hosts.map(profileFor)), sources(p, ...hosts.map(profileFor))),
          ids,
        );
    }
    if (isBoard(n) && p?.power) {
      const supplies = [{ rail: n.rail, ids: [n.id] }];
      for (const w of doc.wires)
        for (const [own, other] of refs(w)) {
          if (own.node !== n.id || own.port !== 'vcc' || w.bus !== 'power')
            continue;
          const supply = byId.get(other.node);
          // A regulator's generic rail may describe its input. Do not infer output.
          if (SUPPLY_KINDS.has(supply?.kind) && other.port === 'out')
            supplies.push({ rail: supply.rail, ids: [n.id, supply.id, w.id] });
        }
      for (const supply of supplies) {
        const v = voltage(supply.rail);
        if (v && (v[0] < p.power.inputMinV || v[1] > p.power.inputMaxV))
          add(
            'error',
            'rdk-power',
            tr('{label} supply {rail} is outside its documented {min}–{max}V input range. {sources}', { label: n.label, rail: supply.rail, min: p.power.inputMinV, max: p.power.inputMaxV, sources: sources(p) }),
            supply.ids,
          );
      }
    }
    if (n.kind === 'rdksoftware') {
      const fields = n.fields || {},
        component = profileFor({
          kind: 'rdksoftware',
          sublabel: fields.package,
        });
      const target = byId.get(fields.target),
        board = profileFor(target),
        data = component?.software;
      const ids = [n.id, ...(target ? [target.id] : [])];
      let reason = '';
      if (!fields.target) reason = tr('Select a target RDK board.');
      else if (!isBoard(target))
        reason = tr('Target board is missing or is not a board.');
      else if (!data || !board)
        reason = tr('Package/board compatibility is unverified.');
      else if (component.compatibility.unsupportedBoardIds.includes(board.id))
        reason = tr('Package is explicitly unsupported on the selected board.');
      else if (!data.boardIds?.includes(board.id))
        reason = tr('Package/board compatibility is unverified.');
      else if (String(fields.runtime || '').trim()) {
        if (!data.runtimes)
          reason = tr('Selected runtime compatibility is unverified.');
        else if (!data.runtimes.includes(fields.runtime.trim()))
          reason =
            tr('Selected runtime is outside the documented supported runtimes.');
      }
      if (reason)
        add(
          'warning',
          'rdk-software',
          tr('{label}: {reason} {sources}', { label: n.label, reason, sources: sources(component, board) || 'https://d-robotics.github.io/tros_doc/en/tros/' }),
          ids,
        );
    }
  }
  const pairs = new Set();
  for (const w of doc.wires) {
    for (const [own, other] of refs(w)) {
      const n = byId.get(own.node),
        p = profileFor(n);
      if (p?.ports && !p.ports.some((port) => port.id === own.port))
        add(
          'error',
          'rdk-interface',
          tr('{label}: connector {port} is unavailable on {product}. {sources}', { label: n.label, port: own.port, product: p.name, sources: sources(p) }),
          [n.id, w.id],
        );
      const host = byId.get(other.node);
      if (!isCamera(n) || !isBoard(host)) continue;
      const board = profileFor(host),
        compatibility = p?.compatibility;
      // Neither side is a vendor-profiled part: there is nothing to verify.
      if (!p && !board) continue;
      const key = `${n.id}|${host.id}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const ids = [
        n.id,
        host.id,
        ...doc.wires
          .filter((link) =>
            refs(link).some(([a, b]) => a.node === n.id && b.node === host.id),
          )
          .map((link) => link.id),
      ];
      if (board && compatibility?.unsupportedBoardIds.includes(board.id))
        add(
          'error',
          'rdk-compatibility',
          tr('{label} is explicitly unsupported on {product}. {sources}', { label: n.label, product: board.name, sources: sources(p, board) || 'https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/' }),
          ids,
        );
      else if (
        !p ||
        !board ||
        !compatibility?.boardIds?.includes(board.id) ||
        !board.ports
      )
        add(
          'warning',
          'rdk-compatibility',
          sentence(tr('{label} with {host}: compatibility is unverified.', { label: n.label, host: host.label }), requirements(p, board), sources(p, board) || 'https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/'),
          ids,
        );
    }
  }
  return findings;
}
