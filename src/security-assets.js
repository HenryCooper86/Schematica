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
