# Review and responsiveness enhancements

Scope: the five improvements approved on 6 October 2026. Keep the existing
plain JavaScript application, document schema, undo behavior, and local storage.

## Delivery and acceptance

1. Share a read-only before/after diagram view between comparison and edit
   previews. Mark additions, removals, rewiring, other edits, and movement;
   provide a text legend and item focus. Both diagrams use the same bounds.
   Applying stays one undo step and stale drafts remain rejected.
2. Add a guided interface checklist with field-specific explanations and
   focus actions, plus navigation to the next incomplete or failed connection.
   Blank fields remain unknown; navigation never saves or invents declarations.
3. Extend impact summaries with scoped requirement verification evidence,
   missing allocations, stale evidence, and record-only changes. Reuse this
   summary in previews and baseline reviews.
4. Measure 100/500/1,000-node redraw, drag, selection, and search. Retain
   unchanged SVG item elements, replacing only changed markup and preserving
   item order. Verify connected-wire updates, removals, selection, and exports.
   Report measured results without universal latency guarantees.
5. Add a Firefox CI job and retain browser screenshots, reports, and logs on
   failure. Preserve the existing release gate on successful CI.

## Verification

Use focused unit regressions for data changes and browser assertions for visual
previews, guidance, SVG identity, and interaction. Run full unit/lint/workflow
validation after integration, native Firefox, and the responsive suites.
Keep generated evidence under `.acceptance/enhancements/` and summarize results
here when complete. Do not publish or push this work without a further request.

## Delivered

All five items above are implemented. Visual previews appear before assistant
edits and part replacements, and comparison diagrams now share a scale. The
interface guide focuses exact fields, identifies remaining conflicts, and blocks
its Next action while the form contains unsaved edits. Impact reviews and offline
packages include scoped verification evidence. The renderer reuses unchanged SVG
items while retaining full geometry/markup recomputation for correctness.

Firefox now runs as a separate CI job. The existing deployment workflows require
the whole CI workflow to succeed, including this job. Chrome records per-suite
reports and captures screenshots on test failure; Firefox retains its existing
report/screenshot/driver log. CI uploads failure evidence for 14 days. A deliberate
local failure verified Chrome's report and screenshot path; no hosted CI run or
deployment was performed for this change.

Browser installation follows the maintained
[Firefox setup action](https://github.com/browser-actions/setup-firefox) and
[geckodriver setup action](https://github.com/browser-actions/setup-geckodriver).

## Verification results

| Check | Result |
| --- | --- |
| Unit tests | 919 passed, no failures or skips |
| Full Chrome regression | 224/224 passed |
| Engineering integration | 38/38 passed |
| Recovery and assistant preview | 17/17 passed |
| Responsive layout, including visual previews | 168/168 passed |
| Blueprint/assistant skills | 12/12 passed |
| Web-source workflows | 8/8 passed |
| Presentation workflows | 17/17 passed |
| Visual differences and incremental DOM identity | 5/5 passed |
| Firefox native suite | 78/78 passed |
| Safari native suite | 78/78 passed |
| Deployment/rollback tests | 7 passed |
| Source lint, workflow validation, whitespace | Passed |

Successful browser runs reported no captured console errors or exceptions. Tests
cover repeated requirement IDs in different subsystem scopes, method-only edits,
missing declarations, power/ground applicability, visual differences, preservation
of unaffected DOM elements, connected-wire movement, stacking order, deletion,
snapshot restoration, and narrow-screen access to Apply. Desktop preview imagery
was inspected locally. Browser counts overlap and are not distinct feature counts.

## Measured responsiveness

Median milliseconds on the local Chrome runner, before → after:

| Nodes | Repeated redraw | Drag redraw | Selection redraw | Search |
| --- | --- | --- | --- | --- |
| 100 | 9.5 → 0.9 | 7.4 → 0.8 | 8.6 → 0.6 | 0.1 → 0.1 |
| 500 | 32.4 → 2.6 | 30.6 → 2.7 | 33.0 → 2.5 | 0.4 → 0.3 |
| 1,000 | 71.3 → 5.6 | 64.7 → 4.7 | 68.0 → 4.3 | 0.7 → 0.6 |

[Machine-readable before/after summaries](performance-incremental-2026-10-06.json)
include browser/device metadata, median and observed P95 for five operations per
measurement, plus layout, checks, export, and memory observations. The final run
had no concurrent test suites. These small local samples measure synchronous
renderer work and search calls, not initial-load performance, frame presentation,
full pointer-to-paint latency, or supported-device service levels. Search was not
optimized; its small differences are measurement variation. Geometry and markup
still recompute across the board; the gain comes from avoiding unnecessary SVG
replacement. CI does not enforce hardware-dependent timing thresholds.

Live provider acceptance, hosted CI execution, participant studies, and physical
hardware validation remain outside these local results.
