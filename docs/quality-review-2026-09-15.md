# Quality review — 15 September 2026

This is the initial audit. For the subsequently implemented roadmap and current
validation status, see [roadmap implementation](roadmap-implementation.md).

## Audience and positioning

The intended users are embedded and system architects. Schematica's existing
strengths are typed connectivity, hardware presets, local documents, design-rule
checks, custom parts, board comparison, and portable review/presentation artifacts.
The proposed focus is **fast, reviewable embedded-system architecture work**.
Category leadership needs evidence from working engineers; a source review alone
cannot establish it or guarantee the absence of bugs.

## Changes implemented

| Area | Confirmed issue | Change |
| --- | --- | --- |
| Persistence | Closing a tab inside the debounce window could lose the latest edit; selection events postponed saves. | Extracted an autosave controller, flush on pagehide/hidden, ignore unchanged document notifications, retain failure/retry behavior. |
| Undo | Toolbar history actions could replace a document during an open drag batch. | Disable undo/redo while a batch is active; cancellation prunes stale selection IDs. |
| AI | A provider resolving after Stop or board replacement could apply stale edits and finish another board's batch. | Validate cancellation and document generation after provider awaits and before edits; finish only the original board's batch. |
| Import | Inherited object names passed catalogue/bus/disposition membership checks. | Require own catalogue keys and use safe generic fallback. |
| Import | Five- and seven-digit hex colors were accepted despite being invalid CSS. | Accept only 3, 4, 6, or 8 hexadecimal digits. |
| Power | Missing downstream currents disappeared from upstream completeness, enabling misleading battery-runtime estimates. | Propagate incomplete loads, keep known subtotals, and suppress runtime estimates until the load is complete in Check, Power, and BOM. |
| Power | A declared zero supply/fuse rating was treated as missing; extreme unit scaling could overflow. | Keep zero as a real rating and reject non-finite scaled quantities. |
| Power | Cached totals calculated outside a recursion guard could be reused inside a cyclic traversal. | Compute each root independently and remove the unsafe cache; verify wire-order independence. |
| Clipboard | Template identity ignored power feed/pass-through semantics. | Include feeds, passes, and trio metadata in definition comparison. |
| BOM | Delimiter-containing custom names/part numbers could collide in the grouping key. | Use structured tuple keys. |
| Maintainability | Autosave lifecycle lived in boot wiring; paste offset assigned values immediately overwritten. | Extracted testable persistence logic; removed redundant assignments and obsolete translations. |
| Review automation | Saved-board validation required opening the browser. | Added `npm run check:board`, with multiple files, JSON reports, strict warning handling, and import-repair failures. |
| Backend | The request deadline aborted provider fetches but did not interrupt a stalled incoming request body. | Apply cancellation to body reads, return a timeout, and release the concurrency slot. |

Regression tests exercise these boundaries; the browser suite also verifies a
last-moment save and reload. Provider tests use local scripted responses rather
than paid/live model calls.

### Verification results

- `npm test`: 808 passed, zero failures (baseline: 788).
- `npm run e2e`: 186 browser checks passed, zero console errors.
- `PRESENTATION_E2E_ONLY=1 npm run e2e`: 17 checks passed, zero console errors.
- Strict CLI validation of the built-in Sensor Node: passed with no findings or import warnings.
- `git diff --check`: passed.

## Maintainability assessment

The code already has useful boundaries: pure document/geometry/check functions,
a store, UI modules, provider adapters, and a separate server. It does not warrant
a framework rewrite just because it uses plain JavaScript. The largest behavior
modules deserve gradual extraction when editing their responsibilities:

- `src/tools.js`: separate clipboard commands and pointer gesture lifecycle.
- `src/ui/assistant-ui.js`: separate request/session state from DOM rendering.
- `src/render.js`: separate geometry indexing from SVG construction.

Keep these extractions behavior-preserving, with workflow tests first. Do not
remove exports merely because the browser does not import them: tests, tooling,
and reusable pure APIs also use them. This pass removed confirmed redundant code;
it is not an exhaustive dead-code proof or performance profile.

## Product roadmap

These are proposed follow-up projects, not features claimed to be implemented.

| Priority | Deliverable | Acceptance criteria |
| --- | --- | --- |
| P1 | Project recovery and named revisions | Recover previous named boards after New/Open/Example; retain a bounded revision history; show storage failures and cross-tab conflicts; export any revision. |
| P1 | Interface control document (ICD) | Each connection has direction, endpoint names, voltage domain, protocol version, rate/bandwidth, and source reference; export a stable table; flag missing required fields. |
| P1 | Requirements and decisions | Link requirement IDs, rationale, owner, evidence URL, and verification status to parts/connections; list unallocated requirements; preserve links through save, copy, and revisions. |
| P1 | Explicit budget assumptions | Model regulator efficiency/conversion, operating modes, known/unknown loads, and simultaneous peaks; label estimates and assumptions; verify with worked reference circuits. |
| P2 | Hierarchical subsystems | Reusable subsystems expose boundary ports; collapsed and expanded views preserve connectivity and identity; duplication remaps all references. |
| P2 | Review package | Export a revision comparison, board, ICD, BOM, findings, assumptions, and decisions together; stable finding IDs support reviewed exceptions with rationale. |
| P2 | Interchange | Define a documented CSV/JSON interface/BOM format; trial a KiCad import against real teams' files before promising bidirectional synchronization. |
| P2 | Large-board interaction | Benchmark representative 100/500/1,000-node boards; measure drag, search, checks, export, and memory; set budgets from supported laptops. Profile before adding indexes or workers. |
| P3 | Team collaboration | Validate demand for comments, reviewer sign-off, and permissions before building live multiplayer editing or account infrastructure. |

### Why these priorities

System Composer documents requirements links, architecture properties, analysis,
and interface control documents as core systems-engineering workflows:
[official product documentation](https://www.mathworks.com/help/systemcomposer/index.html).
This supports prioritizing traceability and interface handoff; it does not establish
that Schematica needs feature parity with a simulation/MBSE suite.

KiCad's documentation distinguishes connectivity/electrical checking from the
rest of the design process:
[official electrical-rule-check guide](https://docs.kicad.org/6.0/en/getting_started_in_kicad/getting_started_in_kicad.html#electrical_rules_check).
Schematica should similarly make rule coverage and unmodeled assumptions clear.

### Proving day-to-day value

Recruit five embedded/system architects for three repeated tasks: create a sensor
subsystem, review a proposed revision, and hand the design to a firmware/hardware
colleague. Record completion time, repair/rework, missed interface assumptions,
and whether the exported package answers the recipient's questions. Repeat after
P1 changes. Use those results to decide the next release, rather than equating a
larger feature list with a better tool.

## Remaining verification boundaries

- Automated browser checks target Chrome; Safari/Firefox and assistive technology
  need dedicated runs.
- Paid-provider acceptance, live deployment/load testing, and crash/power-loss
  recovery are separate from the local checks performed here.
- Power accounting remains a sum of declared figures, not electrical simulation.
- Large-board latency and multi-tab editing conflicts need measured follow-up.
