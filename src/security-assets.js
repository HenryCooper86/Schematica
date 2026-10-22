// Catalogue bridge for security illustrations. A validated finding may name a
// real Schematica catalogue kind (assetKind) so diagrams draw recognizable
// assets — an OS, a server, a firewall, a threat actor — instead of generic
// flow boxes. This module is the single owner of which catalogue kinds are
// eligible and how a finding without a supported claim resolves to a neutral
// glyph. Everything is derived from PARTS; there is no second catalogue to
// keep in sync, and an assetKind is always one of these ids, never free text.
import { PARTS } from './palette.js';

// Real catalogue kinds a finding may claim as its illustration asset.
// Flowchart-only shapes (part.shape) are placeholders, not assets, and
// "generic" is the blank custom box unresolved findings already fall back to.
export const SECURITY_ASSET_KINDS = Object.freeze(
  Object.keys(PARTS).filter(kind => kind !== 'generic' && !PARTS[kind].shape),
);
const ASSET_KIND_SET = new Set(SECURITY_ASSET_KINDS);

// Role-neutral glyphs for findings without a supported concrete asset: they
// describe the finding's role in the analysis, never a specific deployed thing.
const DEFAULT_ASSET_BY_KIND = Object.freeze({
  affected: 'generic',
  component: 'generic',
  mitigation: 'generic',
  root_cause: 'vulnerability',
  step: 'exploit',
  prerequisite: 'preparation',
  impact: 'startend',
});
const NEUTRAL_ASSET = 'decision';

// Resolve the catalogue kind a finding illustrates as. An explicit assetKind is
// honoured only when it names an eligible kind and the finding's applicability
// is established (basis "source" or "inference"): basis "unknown" findings —
// including citation downgrades, reserved/rejected records and historical
// saved analyses — always render with the role-neutral default instead of a
// speculative concrete asset. The record itself stays valid; only the resolved
// glyph is clamped. Never guesses from the finding's title or detail text.
export function securityAssetKind(finding) {
  const hinted = finding?.assetKind;
  if (finding?.basis !== 'unknown' && ASSET_KIND_SET.has(hinted)) return hinted;
  return DEFAULT_ASSET_BY_KIND[finding?.kind] ?? NEUTRAL_ASSET;
}

// The four logical link lanes every generated security card exposes. A card
// pair addresses them by name; all sit on the untyped "link" bus so a port
// carries any number of wires and a pair keeps its sixteen lanes.
const SIDE_PORTS = ['n', 'e', 's', 'w'];
const SIDE_OF = { n: 'top', e: 'right', s: 'bottom', w: 'left' };

// The illustration card a finding draws as. A catalogue kind that already
// offers the four side ports on the link or flow bus is placed as the real
// catalogue node — its glyph, badge and fields stay catalogue data. Any other
// asset (an Ethernet-sided host, a portless person, an MCU) becomes a custom
// card that borrows only the catalogue's identity — name, category, accent
// and glyph through icon:{kind}, never a hand-written path — over four
// logical link ports, so a stated relationship can never become a physical
// Ethernet wire and the global catalogue is never modified to make an asset
// fit. The resolved kind comes from securityAssetKind, so the unknown-basis
// clamp and role-neutral defaults are shared by every caller.
//
// A native threat card hides its sublabel (nodeMeta drops it for `threat`
// parts), so a caller that must keep the finding's value visible — the
// mechanism scenes, where item.value carries the request path or condition —
// passes {visibleValue: true} to route such an asset through that same custom
// adapter: same catalogue identity and glyph, but a custom card, which shows
// its sublabel. Catalogue `figure` threats are exempt: their sublabel already
// shows, so they stay native and keep their illustrated geometry.
export function securityAssetCard(finding, { visibleValue = false } = {}) {
  const kind = securityAssetKind(finding);
  const part = PARTS[kind] ?? PARTS.generic;
  const sides = SIDE_PORTS.map((id) => part.ports.find((p) => p.id === id));
  const hideValue = visibleValue && !!part.threat && !part.figure;
  if (!hideValue && sides.every((p) => p && (p.bus === 'link' || p.bus === 'flow'))) {
    return {
      kind: part.kind, asset: part.kind, name: part.name, custom: null,
      flow: sides.every((p) => p.bus === 'flow'),
    };
  }
  return {
    kind: 'custom', asset: part.kind, name: part.name, flow: false,
    custom: {
      name: part.name,
      category: part.category,
      ...(part.accent ? { accent: part.accent } : {}),
      icon: { kind: part.kind },
      ports: SIDE_PORTS.map((id) => ({ id, name: 'LINK', side: SIDE_OF[id], bus: 'link' })),
    },
  };
}
