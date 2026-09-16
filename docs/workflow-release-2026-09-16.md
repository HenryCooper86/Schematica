# Recovery and review workflows — 16 September 2026

This implements the three fixes and five feature additions from the
[project review](quality-review-2026-09-16.md). Changes are local; this work does
not publish or deploy the application.

## Delivered

- Subsystem operating modes and peak assumptions now reach root power reports,
  BOM totals, checks, and review exports. Grouping copies current assumptions;
  each scope then owns its settings independently.
- Review findings retain their source scope, so internal exception rationale and
  reviewer records appear in the consolidated report. Nested requirement findings
  without item IDs and nested layout findings are included.
- Revision recovery uses IndexedDB transactions for insertion and retention.
  Legacy localStorage revisions migrate only after a successful transaction.
  Failed writes preserve durable history and show an explicit memory-only status
  with retry and export controls. Autosave still uses localStorage and retains
  cross-tab conflict detection.
- AI editing defaults to an isolated draft with changed fields, impact analysis,
  and before/after checks. Apply is one undo step; discard, request failure, and
  cancellation preserve the board. Stale previews cannot replace changed boards.
- Saved views preserve scope, filters, selection, camera, and reading detail in
  board files and offline review packages.
- Revision reviews support comments on parts, wires, and requirements, resolution,
  approval/request-changes, stale approval detection, and JSON exchange. Imports
  preserve conflicting review versions and subsystem scope.
- Verification matrices show methods, evidence, owners, valid allocations,
  changes from baseline, and evidence needing re-review. CSV and review-package
  exports include the matrix.
- First-project guidance in the palette offers actionable steps and a sensor
  example. Existing work must have a durable recovery snapshot before loading
  the starter. Chinese translations cover all new editor controls.

Board schema is now 4; older boards migrate automatically. CI pins Python 3.12
for the deployment tests and separately runs the new workflow browser suite.

## Validation

| Check | Result |
| --- | --- |
| Unit suite | 856 passed |
| Full Chrome regression suite | 209 passed; no console errors or exceptions |
| New Chrome workflow suite | 16 passed; no console errors or exceptions |
| Chrome presentation suite | 17 passed; no console errors or exceptions |
| Native Firefox targeted suite | 58 passed |
| Native Safari targeted suite | 58 passed |
| Deployment tests, Python 3.14 | 7 passed |
| Whitespace validation | `git diff --check` passed |

The new tests exercise isolated AI editing, undo and stale guards, mixed and
nested power settings, scoped review exceptions, verification fingerprints,
review exchange, saved-view persistence, transaction failure/retry, and rendered
offline view restoration. Native suites cover their existing targeted workflows;
the new AI-preview flow uses Chrome and a scripted provider.

The live app was inspected at desktop dimensions. The toolbar retains its existing
one-row layout at 1,500 pixels. The previous Chrome smoke suite explicitly tests
direct AI editing; the additional workflow suite tests preview mode with a local
scripted provider. No paid provider requests are needed by these tests.

## Boundaries

Review authorship is local metadata, not authenticated sign-off. A fingerprint
tracks local content changes; it is not a cryptographic approval signature.
Browser quotas and denied storage remain possible and are surfaced in the UI.
Export important recovery and review milestones; recovery snapshots are bounded.

No new live-provider acceptance, deployment, participant study, or target-laptop
performance study was conducted. The software workflows are implemented; the
five-engineer usability study remains an external validation activity described
in the existing study kit. Incremental SVG rendering remains a profiling follow-up,
not part of these feature additions.

See [engineering workflows](engineering-workflows.md) for usage and semantics.
