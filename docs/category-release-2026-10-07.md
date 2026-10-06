# Category improvement implementation — 7 October 2026

This batch implements the locally executable software from the [category-readiness review](category-readiness-2026-10-07.md). It does not establish market leadership, hardware correctness, or an absence of defects. This report records local validation before release. The preceding deployed revision was `f165df7`; hosted CI and deployment results are recorded in [GitHub Actions](https://github.com/HenryCooper86/Schematica/actions).

## Delivered workflows

- **Guided first review:** First project offers a UART walkthrough alongside the sensor starter. It saves a durable recovery revision before switching, introduces a visible rate mismatch, opens the real interface editor for repair, exports the review and demonstrates Undo. Concurrent edits and active drags prevent stale replacement.
- **Declared teaching references:** power, I2C and CAN examples join the UART reference. All assumptions are illustrative and clearly labelled; they are not independent verification of component specifications.
- **Keyboard wiring:** Connect ports provides labelled part, endpoint and bus selectors, validates real ports and locks, and creates one undoable connection. Ctrl/Command+Enter submits; Escape returns focus to the trigger.
- **Repeatable KiCad import:** source-derived identities and validated provenance survive save/reload. Preview KiCad update shows the proposed changes before a guarded, single-undo apply. Surviving layout, notes and authored pin ordering remain intact. Ambiguous identities, oversized reference IDs, conflicting declarations, unsafe part replacement and lossy pin merges are rejected. Legacy files without provenance need a fresh import.
- **Optional shared review:** operator-issued credentials, editor/reviewer membership, private durable storage, immutable snapshots, revision-bound discussions and authenticated decisions. A new revision does not inherit approval. Concurrent writes return a visible conflict; the UI preserves the pending comment. Shared snapshots never replace the local board. Tokens remain in memory and are cleared on disconnect or dialog close. See [setup, storage limits, provisioning and recovery](team-reviews.md).
- **Evidence collection:** paired engineer-study scoring, versioned assistant evaluation rubrics, 30-sample performance reporting and exact-release checks. Empty, malformed or incomplete evidence cannot earn a passing score. See [commands and evidence limits](validation/README.md).

## Validation

Fresh local results:

| Check | Result |
| --- | --- |
| `npm test` | 985/985 passed, zero skips |
| `npm run lint` and `git diff --check` | Passed |
| Chrome main suite | 263/263 passed |
| Chrome recovery/engineering workflows | 17/17 passed |
| Chrome responsive layouts, English and Chinese | 168/168 passed |
| Focused real-server shared-review browser workflow | 16/16 passed; included in main suite |
| Native Firefox, including shared reviews | 116/116 passed |
| Native Safari, including shared reviews | 116/116 passed |
| Deployment gate/rollback tests, Python 3.14 | 7/7 passed, zero skips |

Browser runs reported no captured console errors or unhandled exceptions. These are automated local checks, not a complete accessibility audit or production availability claim. Detailed reports and screenshots are retained under `.acceptance/category-implementation/` and `.acceptance/{chrome,firefox,safari}/`.

The final whole-change review reported no remaining actionable findings. Integration testing also corrected two test prerequisites: returning from the offline viewer before starting editor workflows, and counting the original guide steps separately from the new UART walkthrough.

The independent reviews led to regression fixes for asynchronous recovery during dragging; preservation of electrical declarations, pin ordering and identity references during KiCad updates; form values captured before controls are disabled; login failure and close/reopen races; and queued writes after a persistence failure. A final directory-sync failure has an explicit boundary: the renamed file has committed, so the service retains that state and rejects further writes pending operator recovery.

The controlled renderer benchmark is recorded in [performance-2026-10-07.json](validation/performance-2026-10-07.json). At 1,000 nodes, drag redraw measured median 3.8 ms / P95 4.5 ms on this Mac. The two-animation-frame scheduling proxy measured median 33.3 ms / P95 34.3 ms. Neither measures native input-to-paint latency or establishes performance on other devices. Native browser regression runs under concurrent load are not substituted for this controlled result.

## Work that still needs external evidence or operator setup

- Five consented engineer sessions and measured comparisons with their current tools.
- Independent review of exact component/document revisions and at least three permitted team KiCad fixtures.
- Manual screen-reader trials and representative physical-device input-to-paint/memory measurements.
- Recorded live-provider/model evaluations against the new task rubric.
- Production identity/retention ownership, private persistent storage, deployment, independent availability history and a production restore drill.

The optional team service remains disabled without explicit operator configuration. No participants were contacted, no private team designs were invented, and no study, provider, physical-hardware or production-recovery success is claimed.
