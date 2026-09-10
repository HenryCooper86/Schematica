// Design-rule checker: pure derivation from a document; the messages are
// written in the interface language.
// Findings: { level: 'error'|'warning'|'info', rule, message, ids: [nodeOrWireIds] }.

import { nodePart } from './rdk/profiles.js';
import { checkRdk } from './rdk/checks.js';
import { busComponents, powerRails, runtimeHours, formatCurrent, formatCapacity, formatHours } from './power.js';
import { tr } from './i18n.js';

// The comparison form of an I2C address: surrounding whitespace and the case
// of the hex prefix and digits carry no meaning. Empty when there is none.
export function i2cAddrKey(addr) {
  return String(addr ?? '').trim().toLowerCase();
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

  // 1. I2C address conflicts within one net. "0x76", " 0X76 " and "0x76"
  //    are the same device address, so compare a normalised key and report
  //    the address as the first conflicting node wrote it.
  for (const component of busComponents(doc, 'i2c')) {
    const byAddr = new Map();
    for (const id of component) {
      const n = byId.get(id);
      const key = i2cAddrKey(n?.addr);
      if (key) {
        if (!byAddr.has(key)) byAddr.set(key, []);
        byAddr.get(key).push(n);
      }
    }
    for (const nodes of byAddr.values()) {
      if (nodes.length > 1) {
        const addr = String(nodes[0].addr).trim();
        findings.push({
          level: 'error',
          rule: 'i2c-addr-conflict',
          message: tr('I2C address {addr} is used by {names} on the same bus.', { addr, names: nodes.map((n) => n.label).join(tr(' and ')) }),
          ids: nodes.map((n) => n.id),
        });
      }
    }
  }

  // 2. Unconnected supply pins. Built-in parts: the VCC/GND consumption pins
  //    by id. Custom parts: every port the definition marks required, on any
  //    bus; power and ground report under the same rule as built-ins.
  for (const n of doc.nodes) {
    const part = nodePart(n);
    for (const port of part.ports) {
      const supply = port.bus === 'power' || port.bus === 'gnd';
      const must = part.custom
        ? port.required === true
        : supply && (port.id === 'vcc' || port.id === 'gnd');
      if (must && !wiredPorts.has(`${n.id}|${port.id}`)) {
        findings.push({
          level: 'warning',
          rule: supply ? 'unconnected-power' : 'unconnected-port',
          message: tr('{label}\'s {port} pin is unconnected.', { label: n.label, port: port.name }),
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
      message: floating.length === 1
        ? tr('{names} is not wired to anything.', { names: floating.map((n) => n.label).join(', ') })
        : tr('{names} are not wired to anything.', { names: floating.map((n) => n.label).join(', ') }),
      ids: floating.map((n) => n.id),
    });
  }

  // 4. Wire bus matches neither endpoint's port bus.
  for (const w of doc.wires) {
    const busOf = (ref) => {
      const n = byId.get(ref.node);
      return n ? nodePart(n).ports.find((p) => p.id === ref.port)?.bus : undefined;
    };
    const ends = [busOf(w.from), busOf(w.to)];
    if (ends[0] !== undefined && ends[1] !== undefined && !ends.includes(w.bus)) {
      findings.push({
        level: 'warning',
        rule: 'bus-mismatch',
        message: tr('A {bus} wire connects ports that are {a} and {b}.', { bus: w.bus.toUpperCase(), a: String(ends[0]).toUpperCase(), b: String(ends[1]).toUpperCase() }),
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
        message: n.status === 'deprecated' ? tr('{label} is marked deprecated.', { label: n.label }) : tr('{label} is flagged end-of-life.', { label: n.label }),
        ids: [n.id],
      });
    }
  }

  // 6. Power budget. A rail is what the power wires join: supplies feeding a
  //    set of consumers, with a regulator sitting on two rails at once and a
  //    fuse in series with one (see power.js). A rail may have no supply drawn
  //    on it at all, which is its own finding rather than a reason to skip it.
  //    Only a rail somebody has put a figure on is reported, so a board that
  //    never fills the current fields in stays as quiet as it was before the
  //    fields existed.
  for (const rail of powerRails(doc)) {
    if (!rail.declared) continue;
    const draw = formatCurrent(rail.typicalMa);
    const peak = formatCurrent(rail.peakMa);
    // The typical sum is what gets judged; the peak sum rides along beside it
    // so a reader sees both numbers on one line.
    const extra = rail.peakMa > rail.typicalMa ? ` ${tr('Peaks add up to {peak}.', { peak })}` : '';
    const ids = [...rail.sources, ...rail.passes, ...rail.draws].map((e) => e.node.id);
    // More than one supply feeds this rail, so no message may pin its draw on
    // any single one of them.
    const shared = rail.sources.length > 1;
    const names = rail.sources.map((s) => s.node.label).join(tr(' and '));
    const label = rail.sources.length ? rail.sources[0].node.label : '';

    if (!rail.sources.length) {
      // Consumers sharing a rail with nothing drawn to feed them: the very
      // common "the MCU's 3V3 out runs the sensors", where the supply is a pin
      // on a part rather than a part of its own. The sum is real, so it is
      // worth stating, but there is no rating anywhere to compare it against.
      if (rail.declaredDraw) {
        findings.push({
          level: 'info',
          rule: 'power-no-supply',
          message: tr('The parts on this rail draw {draw}, but nothing wired to it is drawn as a supply.', { draw }) + extra,
          ids,
        });
      }
    } else if (rail.limitComplete) {
      const limit = formatCurrent(rail.limitMa);
      const vars = { label, names, limit, draw, peak };
      // Two supplies on one rail are judged together, against the sum of what
      // they declare. That sum is an upper bound: how the load actually
      // divides between them depends on droop, sense wiring and whether the
      // parts were built to share at all, none of which is modelled.
      const caveat = shared ? ` ${tr('How the load divides between them is not modelled.')}` : '';
      if (rail.typicalMa > rail.limitMa) {
        findings.push({
          level: 'error',
          rule: 'power-budget',
          message: (shared
            ? tr('{names} can supply {limit} between them, but the parts on their rail draw {draw} in total.', vars)
            : tr('{label} can supply {limit}, but the parts on its rail draw {draw}.', vars)) + extra + caveat,
          ids,
        });
      } else if (rail.typicalMa > rail.limitMa * 0.8) {
        findings.push({
          level: 'warning',
          rule: 'power-budget',
          message: (shared
            ? tr('{names} can supply {limit} between them and the parts on their rail already draw {draw} in total.', vars)
            : tr('{label} can supply {limit} and the parts on its rail already draw {draw}.', vars)) + extra + caveat,
          ids,
        });
      } else if (rail.peakMa > rail.limitMa) {
        // The typical sum fits and the peaks do not. Whether two peaks ever
        // land in the same instant, and whether the bulk capacitance rides
        // them out, is not something a sum of datasheet figures can settle -
        // so this is a warning that names its own assumption rather than an
        // error, and adding the peaks up is the conservative reading of them.
        findings.push({
          level: 'warning',
          rule: 'power-budget-peak',
          message: (shared
            ? tr('{names} can supply {limit} between them; the peaks on their rail add up to {peak} if they all land at once.', vars)
            : tr('{label} can supply {limit}; the peaks on its rail add up to {peak} if they all land at once.', vars)) + caveat,
          ids,
        });
      }
    } else if (rail.declaredDraw) {
      // No usable rating to compare the sum with: either nothing on the rail
      // states one, or only some of the supplies do and the rest could deliver
      // anything. Name the ones that stated nothing. A rail whose only figure
      // was carried across from downstream says nothing here, because a
      // derived number is no reason to demand a rating.
      const quiet = rail.sources.filter((s) => !(s.currents.limitMa > 0));
      const who = quiet.map((s) => s.node.label).join(tr(' and '));
      findings.push({
        level: 'info',
        rule: 'power-budget-unknown',
        message: (quiet.length === 1
          ? tr('{names} declares no output current limit, so the {draw} on its rail cannot be checked.', { names: who, draw })
          : tr('{names} declare no output current limit, so the {draw} on their rail cannot be checked.', { names: who, draw })) + extra,
        ids,
      });
    }
    // A fuse or a fuse box is in series with the whole rail, so its rating is
    // a limit on everything downstream of it. Only the typical sum is judged:
    // a fuse has a time-current curve and is meant to carry a brief overload,
    // so calling its rating blown on a sum of datasheet peaks would be wrong.
    for (const pass of rail.passes) {
      const rating = pass.currents.limitMa;
      if (!(rating > 0)) continue;
      const vars = { label: pass.node.label, limit: formatCurrent(rating), draw };
      if (rail.typicalMa > rating) {
        findings.push({
          level: 'error',
          rule: 'power-fuse-rating',
          message: tr('{label} is rated {limit}, but the parts on its rail draw {draw}.', vars),
          ids,
        });
      } else if (rail.typicalMa > rating * 0.8) {
        findings.push({
          level: 'warning',
          rule: 'power-fuse-rating',
          message: tr('{label} is rated {limit} and the parts on its rail already draw {draw}.', vars),
          ids,
        });
      }
    }
    // Parts that state nothing are never assumed to draw zero, and saying so
    // must not depend on some other rule having fired first: a rail that fits
    // its budget comfortably is exactly where an unread datasheet hides. The
    // ids are the silent parts themselves, so Select picks them out.
    // Only where there is a total for them to be missing from: a rail whose
    // sole figure is a cell's capacity is computing nothing yet, and saying
    // parts are left out of a 0 mA sum would be noise, not information.
    if (rail.unknown && rail.draws.length > rail.unknown) {
      findings.push({
        level: 'info',
        rule: 'power-budget-unknown-parts',
        message: rail.unknown === 1
          ? tr('One part on this rail declares no current, so the {draw} total leaves it out.', { draw })
          : tr('{n} parts on this rail declare no current, so the {draw} total leaves them out.', { n: rail.unknown, draw }),
        ids: rail.unknownIds,
      });
    }
    // A cell with a capacity and a known load has a runtime. It is division,
    // not a model: no duty cycle, no converter losses, no ageing, no cut-off.
    // The word "continuous" is load-bearing - a board that sleeps between
    // readings runs far longer than this, and the line must not read as a
    // forecast that contradicts the board's own note.
    for (const source of rail.sources) {
      const hours = runtimeHours(source.currents.capacityMah, rail.typicalMa);
      if (hours == null) continue;
      findings.push({
        level: 'info',
        rule: 'battery-runtime',
        message: tr('{label} holds {capacity}; at a continuous {draw} that is about {hours} h, ignoring duty cycle and conversion efficiency.', {
          label: source.node.label, capacity: formatCapacity(source.currents.capacityMah), draw, hours: formatHours(hours),
        }),
        ids: [source.node.id],
      });
    }
  }

  findings.push(...checkRdk(doc));
  const order = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
