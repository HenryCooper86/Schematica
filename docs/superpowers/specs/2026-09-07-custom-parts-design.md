# Schematica Custom Parts — Design Spec

**Date:** 2026-09-07
**Status:** Approved in chat, section by section, on 2026-09-07

## Summary

Schematica's palette is a fixed catalogue. Every real project has a part the
catalogue lacks, and today the only answer is the generic "Custom box" with
four GPIO ports. This release lets a user **define their own parts**: a name,
a category, an icon, typed ports on chosen sides, and optional extra fields.
Custom parts draw, wire, check, and export exactly like built-in ones.

A custom part's definition **travels inside the node that uses it**, so board
files, share links, autosave, undo, and duplicate need nothing new and an
older build of the app degrades a custom node to a generic box the way it
already handles an unknown kind. A **personal library** in the browser keeps
definitions for reuse across boards, with export and import as a JSON file.
Any built-in part can be **customized** into a starting definition, so "an MCU
with a second CAN port" is a two-minute job. The **assistant** can define and
edit custom parts too, including from an attached datasheet.

## Goals

- Define a part with name, category, accent, icon, up to 24 typed ports, and
  up to 8 extra fields, through an editor that previews the real card.
- Place, wire, check, export, share, and undo custom parts with no special
  cases anywhere outside the resolver.
- Keep a personal library of definitions in the browser; export and import it.
- Customize any built-in part into a custom one without losing its wires.
- Let the assistant add custom parts when no catalogue kind fits, and edit
  the ports of custom parts already on the board.
- Degrade gracefully: older app builds open the file; a bad definition
  becomes a generic box with a warning, never a crash or a silent drop.
- Ship with unit tests and a browser smoke scenario that run in CI.

## Non-goals (this release)

- Custom flowchart shapes, threat semantics (dashed border, severity), or
  per-node icon upload beyond an SVG path string.
- Per-port direction, voltage, or current; a power budget is its own feature.
- A shared, synced, or cloud library. The library is per browser, plus files.
- Editing built-in catalogue parts in place; "Customize" makes a copy.
- Changing built-in card sizes; only custom cards grow with their ports.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where the definition lives | Inline in the node (`kind: "custom"`, `part: {...}`) | No global state; every existing pure function keeps its signature; files and links stay self-contained; the assistant's plain-document executor and a future MCP server need nothing |
| Type versus instance | Library templates are stamped into nodes; editing a placed part offers apply-to-all for siblings from the same template | Gives reuse and bulk edit without a registry; two copies that diverge are a variant, not a bug |
| Resolution | One resolver `partOf(node)` replaces `getPart(node.kind)` at node call sites; `getPart(kind)` stays for kind-only callers | Smallest blast radius: the RDK wrapper already funnels checks, wiring, and rendering through one place |
| One validator | `normalizePart(raw)` in `src/custom.js` serves the editor, the file loader, and the assistant ops | Three producers, one rule set, one set of limits |
| Port offsets | Not stored; ports on a side are spaced evenly in list order | No layout math in the editor; reordering the list is the whole positioning UI |
| Required ports | A per-port `required` flag replaces the built-in "vcc/gnd/vin" name heuristic for custom parts | Names are user-chosen and unreliable; the flag also covers a mandatory clock or enable pin |
| File schema | `SCHEMA_VERSION` 1 → 2 with a no-op migration step | Older builds warn "newer than this app" and then coerce custom nodes to generic boxes, which is honest and already implemented |
| Library storage | One localStorage key with the memory fallback the assistant settings use; capped at 200 templates | Same blocked-storage behaviour as the rest of the app |

## The definition

A custom node is a normal node plus one key:

```json
{
  "id": "n7k2…", "kind": "custom", "x": 320, "y": 160,
  "label": "Motor driver x4", "sublabel": "MD-4", "color": null,
  "addr": "", "rail": "12V", "notes": "", "status": null, "flags": [],
  "fields": { "f1": "4" },
  "part": {
    "lib": "lp9d3…",
    "name": "Motor driver x4",
    "category": "actuators",
    "accent": null,
    "icon": { "kind": "motor" },
    "ports": [
      { "id": "p1", "name": "VCC",  "side": "top",  "bus": "power", "required": true },
      { "id": "p2", "name": "GND",  "side": "top",  "bus": "gnd",   "required": true },
      { "id": "p3", "name": "CAN",  "side": "left", "bus": "can" },
      { "id": "p4", "name": "M1",   "side": "right", "bus": "pwm" },
      { "id": "p5", "name": "M2",   "side": "right", "bus": "pwm" }
    ],
    "fields": [
      { "id": "f1", "label": "Channels" },
      { "id": "f2", "label": "Drive", "options": ["brushed", "brushless", "stepper"] }
    ]
  }
}
```

Field by field:

- `lib`: the library template id this copy came from; absent for a one-off.
  Used only to find siblings for apply-to-all and BOM grouping.
- `name`: 1–60 characters. The palette item, the props header, and the BOM
  use it. The node's `label` starts as the name and is edited independently.
- `category`: one of `CATEGORIES` ids. Sets the default accent, the palette
  colour, and the layout engine's column. Unknown → `misc` with a warning.
- `accent`: a hex colour accepted by the loader's existing `HEX_COLOR` test
  (3 to 8 hex digits) or null (category colour). The node's own
  `color` still overrides per instance, as today.
- `icon`: exactly one of
  - `{ "kind": "<built-in kind>" }` — draws that part's icon or glyph;
  - `{ "text": "MD" }` — 1–3 characters drawn bold in the badge;
  - `{ "path": "M4 4h8v8H4z …" }` — a 16-box path, matched against
    `^[MmZzLlHhVvCcSsQqTtAa0-9\s,.eE+-]+$`, at most 2000 characters.
  Missing or invalid → initials from the name's first (up to) two letters,
  with a warning.
- `ports`: 0–24 entries. `id` is a stable string unique within the part
  (`p1`, `p2`, … when generated; a customized built-in keeps its original
  ids so wires survive). `name` 1–12 characters; `side` one of left, right,
  top, bottom; `bus` a `BUSES` id, unknown → `gpio` with a warning;
  `required` boolean, default false. Two ports may share a name on
  different sides; the same name on the same side is rejected by the editor,
  and the loader keeps the first and drops the rest with a warning. An entry with no usable
  id, side, or name is dropped with a warning, and wires on it are dropped
  with the existing "missing endpoint" warning.
- `fields`: 0–8 entries. `id` stable (`f1`, …); `label` 1–40 characters;
  `options` optional, 2–20 strings of up to 40 characters each; `placeholder`
  optional. Values live in `node.fields` keyed by field id, validated and
  trimmed exactly like threat fields today. When a definition changes (editor
  save, `update_part`, or load), values whose field id no longer exists are
  dropped, as the loader already does for unknown field ids.

## Resolution: `src/custom.js`

```js
export const LIMITS = { name: 60, ports: 24, portName: 12, fields: 8, fieldLabel: 40, options: 20, option: 40, path: 2000, library: 200 };
export function normalizePart(raw) → { part, warnings }   // or { part: null, warnings } when unusable
export function partOf(node) → catalogue-shaped part       // built-in nodes: getPart(node.kind)
export function portsWithOffsets(ports) → ports + offset  // even spacing per side, list order
export function initials(name) → 'MD'
```

`partOf` returns an object shaped like a `PARTS` entry: `kind: 'custom'`,
`name`, `category`, `accent`, `icon` or `glyph` (resolved from the referenced
built-in) or `text` (initials), `ports` with offsets, `fields`, and
`custom: true`. It is memoized in a `WeakMap` keyed on the `part` object, so
render passes pay nothing and undo snapshots (fresh objects) re-resolve once.

Call sites that change from `getPart(node.kind)` to `partOf(node)`:
`geometry.nodeMeta` and `nodeSize`, `rdk/profiles.nodePart` and
`knownPorts` (which takes a node instead of a kind), `bom.buildBOM`,
`ai/layout` category lookup, `ai/context.nodeLine`, `ui/props`, and
`serialize.deserialize`. `render.js`, `drc.js`, `tools.js`, `ai/ops.pickPort`
already go through `nodePart` and need no lookup edit; `render.badgeMarkup`
gains the initials and path branches described below.

## Rendering and sizing

A custom card is the standard card. The badge draws the referenced built-in
icon or glyph exactly as that part would, or the initials centred in the
badge in the accent colour at 13px bold, or the path scaled as a 16-box icon.
Meta lines under the label: part number, address, rail, then field values in
field order; the first three non-empty are shown, as now.

Custom cards grow with their ports so port dots stay at least 15px apart:
height is `max(current, 15 × (ports on the busier of left/right + 1))`, width
is `max(current, 22 × (ports on the busier of top/bottom + 1))`, both still
capped by the existing maximum width. Built-in parts keep their current sizes
(the examples' geometry tests guard this).

## Editor

A native `<dialog id="part-dialog">` styled like the export dialog. Opened
from:

- **+ New part** in the palette's "My parts" group → blank editor.
- **Edit part…** in the properties panel of a custom node → that definition.
- **Customize…** in the properties panel of a built-in node → a definition
  prefilled from the catalogue part: name, category, `icon: { kind }`, ports
  with their original ids, and the part's schema fields if it has any (a
  threat part's STIX fields become plain choice fields; threat rendering is
  not carried over). Saving converts the node to `kind: "custom"` and keeps
  every instance value (label, part number, address, rail, notes, status,
  flags, disposition, colour); wires on ports whose id survived stay
  attached, wires on removed ports are dropped and counted in the toast.

Layout, top to bottom: name and category on one row; accent swatches with
Auto; icon picker with three tabs (built-in icon grid drawn as badges,
initials input, path textarea); ports table with name, side select, bus
select, required checkbox, up/down, remove, and **+ Add port** (new ports
default to `required` on for power and gnd buses); fields table with label,
choices (comma separated), remove, **+ Add field**; a live preview card drawn
by the real `nodeMarkup` into a small SVG, refreshed on every input.

Inline validation disables Save and says why: empty name, duplicate port
name on one side, bad path, over a limit. Footer: **Save to library**
checkbox (on when the node has a `lib`, off for a one-off; saving creates or
updates the template and stamps its id into the node), **Apply to the N
other parts on this board from this template** (shown only when editing a
placed node with siblings; on by default), Cancel, Save. Save is one
`store.apply` whatever the boxes say. Escape cancels.

The editor is inert while an assistant request runs, like every other panel.

## Library: `src/library.js` and the palette group

Storage: localStorage key `schematica.parts`, value
`{ "version": 1, "parts": [ { "id": "lp…", …definition… , "updated": "<iso>" } ] }`.
Reads tolerate a missing or corrupt value (start empty, warn once). Writes
fall back to an in-memory copy when storage throws, as `createSettings`
does. Capped at 200; the 201st save is refused with a toast.

```js
export function createLibrary() → { list(), get(id), save(def) → id, remove(id), importJSON(text) → { added, replaced, warnings }, exportJSON() → text, subscribe(fn) }
```

Export file: `{ "schematicaParts": 1, "parts": [ … ] }`, downloaded as
`<name>.schematica-parts.json`. Import validates every entry through
`normalizePart`, merges by template id (same id replaces, new id adds),
skips unusable entries with warnings, and reports counts in a toast.

Palette: a **My parts** group renders first, after the search box, from the
library. Items drag and click like built-ins (the drag payload gains a
`text/schematica-template` type carrying the template id; drop stamps a copy
with `lib` set). Hovering an item shows edit (pencil) and delete (×)
controls; delete asks nothing but the toast offers Undo for nine seconds, the
pattern `toast()` already supports. The group header has **+ New part**,
**Export**, and **Import** (a hidden file input). When the current board has
custom nodes whose `lib` is missing from the library, or no `lib` at all, the
group lists them under "On this board" with **Add to library** so a board
received from someone else seeds the library. The group's header and its
three buttons always show; the item list is simply empty when there is
nothing to list.

Search: `partHaystack` gains library templates (name, port names, buses,
category), so the palette filter and the assistant's `search_parts` find
them. The search module receives the library list through a setter called
when the library changes, keeping it dependency-free for tests.

## Checks, BOM, layout

- **Checks.** For a custom node, each port with `required: true` and no wire
  yields a finding. Power and gnd ports use rule `unconnected-power` (same
  message shape as today, so the Fix prompt and tests stay valid); any other
  bus uses a new rule `unconnected-port` ("Motor driver x4's EN pin is
  unconnected."). The built-in name heuristic is unchanged for built-in
  parts. All other rules read ports through `nodePart` and need no change.
- **BOM.** Group key for custom nodes is `custom:<lib or name>|<sublabel>`;
  the kind column shows the part name.
- **Layout.** `ai/layout` reads the category through `partOf`; a custom
  supply goes left, a custom compute part goes centre, peripherals right.
- **RDK.** `profileFor` matches on built-in kinds only; custom nodes never
  get an RDK profile.

## Assistant

`apply_edits` gains, validated by `normalizePart`:

- `add_part` with `kind: "custom"` and exactly one of:
  - `custom: { name, category, accent?, icon?: { text } | { kind }, ports: [{ name, side, bus, required? }], fields?: [{ label, options? }] }`
  - `template: "<library id>"` — the executor receives a `library()`
    accessor (optional; tests and a future MCP server may omit it, in which
    case `template` fails with "no library").
- `add_part` with `kind: "custom"` and neither `custom` nor `template`, or
  both, fails with a message naming the two choices.
- `update_part` on a custom node accepts `custom` and replaces the
  definition. Ports are matched **by name**, case-insensitively: a port on
  the same side with that name first, otherwise the first not-yet-matched
  port with that name on any side; so unchanged ports keep their ids and
  wires; a wire on a port
  with no match is moved to another port of its bus by `pickPort` or dropped
  with a warning, and the change line reports kept, rewired, and dropped
  counts as `replace_part` does. `update_part` with `custom` on a built-in
  node fails with "use add_part or the editor's Customize".
- `search_parts` appends matching library templates as
  `template <id>  <name>  ports: …  [library]` lines.
- `nodeLine` for a custom node appends `custom-ports=p1:VCC(power),p2:GND(gnd),…`
  and, when set, `template=<lib>`. The stable catalogue block is unchanged.
- `EDIT_SCHEMA` gains the `custom` and `template` properties; `strict` stays
  off on `apply_edits` as before.
- `ROLE_RULES` gains: "Use a catalogue kind when one fits. Define a custom
  part (add_part with kind custom) only when none does or the user asks;
  take port names and buses from the attached document when there is one;
  say in your reply that you made a custom part." `SINGLE_SHOT_RULES` names
  the same shape.
- The e2e fake assistant answers a prompt starting "Add a custom part" with
  an `add_part` carrying an inline definition, and the smoke test asserts the
  node, its ports, and the highlight.

## Implementation order

Two plans, engine first: (1) `src/custom.js`, the resolver call sites,
sizing and badge rendering, the file format and migration, checks, BOM,
search, and the assistant operations, all unit-tested against plain
documents; (2) the editor dialog, the library module and palette group, the
properties-panel entry points, and the browser scenarios. The engine plan
leaves the app fully working with no visible change except that files with
custom nodes load and render.

## Testing

Unit (`npm test`):

- `tests/custom.test.js`: every limit; id generation; even spacing; path
  regex; unknown category → misc, unknown bus → gpio, both with warnings;
  duplicate same-side names de-duplicated; unusable definition → null;
  round trip; `partOf` memoization and shape; initials.
- `tests/geometry.test.js`: custom card grows with ports per side; every
  example board's node sizes are unchanged.
- `tests/serialize.test.js`: round trip with custom nodes; schema 1 → 2
  migration; bad `part` → generic box with wire remap; dropped port drops
  its wires with a warning; schema 2 file read by `migrateRaw` with target 1
  leaves the raw untouched (older-build behaviour).
- `tests/drc.test.js`: required power port → `unconnected-power`; required
  GPIO port → `unconnected-port`; optional port silent; built-in heuristic
  unchanged.
- `tests/bom.test.js`, `tests/search.test.js`, `tests/library.test.js`
  (merge, cap, corrupt storage, memory fallback, export/import round trip).
- `tests/ai-ops.test.js`: add with inline definition; add from template;
  template without a library fails cleanly; update with name matching and
  the kept/rewired/dropped counts; invalid definition → readable error;
  `custom` on a built-in fails. `tests/ai-context.test.js`: port list line.
  `tests/ai-tools.test.js`: search lists templates.
- `tests/render.test.js`: initials badge, referenced icon, path icon.

Browser (`npm run e2e`), two scenarios in `tests/e2e/smoke.mjs`:

1. Add an MCU from the palette. Open **+ New part**, name it, add VCC
   (power, top), GND (gnd, top), CAN (can, left); save with **Save to
   library**; drop it from My parts; drag a wire from its CAN port to the
   MCU's CAN port; run Check and see the GND
   finding; reload; My parts still lists the template.
2. Select the example's MCU, **Customize…**, add a port, save; the MCU's
   existing wires are still drawn and the node is now custom.

Plus the fake-assistant request above.

## Doors left open

- **Per-port direction and current** for a power budget rule.
- **Shared library** through a URL or a GitHub gist, once the text format
  exists.
- **Custom shapes and threat styling** on the same definition object.
- **`replace_part` to custom** so the assistant can customize a built-in;
  the editor's Customize does it today.
