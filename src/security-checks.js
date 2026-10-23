// Security rules for threat-model boards: pure derivation from a document,
// messages in the interface language. They judge only what the board states
// (threat parts, dispositions, severities and the wires between them); they
// never assess a real system.
// Findings: { level, rule, message, ids } like the design rules in drc.js.

import { nodePart } from './rdk/profiles.js';
import { tr } from './i18n.js';

const hostile = (node) => nodePart(node).threat || node.disposition === 'adversary';

export function securityChecks(doc) {
  const findings = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const links = new Map(doc.nodes.map((n) => [n.id, new Set()]));
  for (const w of doc.wires) {
    if (!byId.has(w.from.node) || !byId.has(w.to.node) || w.from.node === w.to.node) continue;
    links.get(w.from.node).add(w.to.node);
    links.get(w.to.node).add(w.from.node);
  }

  const reachesHostile = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const next of links.get(queue.shift())) {
        if (seen.has(next)) continue;
        if (hostile(byId.get(next))) return true;
        seen.add(next);
        queue.push(next);
      }
    }
    return false;
  };

  for (const n of doc.nodes) {
    const part = nodePart(n);
    // A threat linked to nothing says nothing about what it endangers.
    if (part.threat && !links.get(n.id).size) {
      findings.push({
        level: 'warning',
        rule: 'threat-unlinked',
        message: tr('{label} is not linked to anything it threatens.', { label: n.label }),
        ids: [n.id],
      });
    }
    // A victim that no threat or adversary can reach, along any chain of
    // wires (attacks usually pass through intermediate parts), has no stated
    // cause.
    if (n.disposition === 'victim' && !reachesHostile(n.id)) {
      findings.push({
        level: 'warning',
        rule: 'victim-no-threat',
        message: tr('{label} is marked as a victim, but no threat or adversary reaches it.', { label: n.label }),
        ids: [n.id],
      });
    }
    // Reports rank threats by severity; one without it sorts last.
    if (part.threat && part.fields?.some((f) => f.id === 'severity') && !String(n.fields?.severity ?? '').trim()) {
      findings.push({
        level: 'info',
        rule: 'threat-no-severity',
        message: tr('{label} has no severity, so reports cannot rank it.', { label: n.label }),
        ids: [n.id],
      });
    }
  }
  return findings;
}
