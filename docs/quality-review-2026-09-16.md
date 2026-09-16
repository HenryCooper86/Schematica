# Project review — 16 September 2026

Implementation follow-up: [recovery and review workflow release](workflow-release-2026-09-16.md).

Reviewed local commit `58ad990`. This is a source and automated-workflow review,
not proof that the application is bug-free or a human usability study. No
application code was changed during this review.

## Assessment

Schematica has a substantial engineering foundation: typed connections, checks,
portable boards, revisions, requirements and decisions, interface declarations,
power assumptions, nested subsystems, review packages, and an AI assistant.
The September 15 roadmap is largely implemented; proposing those same features
again would miss the current needs. The next release should first make nested
engineering workflows and durable recovery consistent, then improve how users
understand, approve, and share changes.

## Reproduced findings

### P1: Subsystem operating assumptions disagree with parent analysis

Locations: `src/analysis-doc.js:46`, `src/power.js:215`,
`src/ui/engineering-ui.js` budget form.

Reproduction: connect a battery to an MCU; declare active current of 100 mA and
sleep current of 1 mA; group both into a subsystem. Open that subsystem and select
Sleep under Budget assumptions. Its power total is 1 mA. Calling `powerRails` on
the reconstructed root document returns 100 mA for the same internal rail.

The flattening step retains root engineering settings, while the UI permits
separate settings inside each subsystem. Parent analysis therefore ignores the
child operating mode. This can also understate consumption when the parent is
asleep and the subsystem is explicitly active.

Recommended fix: define and implement explicit inheritance/override semantics
for operating mode and peak assumptions, or make them visibly root-only settings.
Verify the same design in the expanded editor, root power report, BOM, checks,
and exported review. Include mixed-mode and nested cases.

### P2: Subsystem review exceptions lose their context in root review packages

Locations: `src/review.js:48`, `src/drc.js` subsystem finding remapping.

Reproduction: inside a subsystem, attach an owner and rationale to an
`unconnected-power` finding. `reviewFindings(child)` attaches that exception.
`reviewPackage(root).findings` contains no attached exception from that child.

Root findings map internal IDs to visible subsystem IDs and exception lookup
only searches root engineering data. The embedded board still contains the child
record, but the consolidated findings table loses its reviewed status and rationale.

Recommended fix: retain scope-qualified finding identity separately from canvas
selection targets, resolve exceptions in their source scope, and export that scope.
Test duplicate local IDs, nested subsystems, and fingerprint invalidation.

### P1: Revision storage can remain full while newer revisions are memory-only

Locations: `src/revisions.js:25–43`, `src/ui/engineering-ui.js` revision list.

Reproduction used an in-memory Storage implementation enforcing a 5 MiB quota.
Ten valid snapshots, each containing 35 notes of 10,000 characters (approximately
700 KB of string data), produced three write
failures. The current session listed Board 9 as newest; a fresh revision manager
over the same storage listed Board 6. Board 9 had no durable storage key.

The code writes before pruning, sets a 6 MiB retention target, and deliberately
preserves older durable entries after failed writes. This protects old snapshots
but leaves no automatic route out of quota exhaustion. An error toast exists;
the revision list does not persistently distinguish memory-only entries. Autosave
and other application data also share the origin's localStorage quota.

Recommended fix: use transactional IndexedDB storage for revision rotation,
preserve the last durable recovery point, and show persistent save status with
retry/export actions. Test quota exhaustion and reload with realistic shared
storage usage. IndexedDB still requires explicit quota-failure handling.
See [MDN storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Recommended additions, in order

| Priority | Addition | First useful release and acceptance criteria |
| --- | --- | --- |
| 1 | AI change preview | Run proposed edits on a draft; show additions, removals, changed interfaces, and before/after findings. Apply or discard atomically; reject stale previews when the board changes. Reuse existing impact analysis. |
| 2 | Saved engineering views | Save named views such as Power, Firmware interfaces, and Security, including filters, scope, detail level, and camera. Restore from board files and review exports without duplicating the architecture. Current Explore filters and Journey cameras provide a foundation. |
| 3 | Revision-linked review comments | Attach comments to parts, wires, requirements, and an exact revision. Support open/resolved discussions, review status, and exchangeable review files. Invalidate approval when relevant data changes. Start with asynchronous review; investigate authenticated team sign-off after user validation. |
| 4 | Requirements verification matrix | Extend existing requirement records into a filterable matrix of owner, allocation, verification method, evidence, and changes since baseline. Flag evidence needing re-review when its allocated design changes; export the matrix. |
| 5 | Guided first project | Build on existing examples with a short workflow: place parts, connect interfaces, fill missing declarations, run checks, export a review. Measure completion and confusion with five target engineers before expanding onboarding. |

These are product recommendations, not implemented features or validated demand.
Saved views and traceability have precedent in
[System Composer](https://www.mathworks.com/help/systemcomposer/).
Revision-bound discussion and approve/request-changes states have precedent in
[GitHub reviews](https://docs.github.com/en/pull-requests/reference/pull-request-reviews).
Those references inform workflow choices; they do not establish feature parity
requirements or Schematica user demand.

## Engineering follow-ups

- Profile incremental SVG updates for large boards. Existing measurements report
  about 74 ms for a 1,000-node full redraw; those historical numbers are not new
  measurements from this review and do not measure end-to-end input latency.
- Add quota-pressure and nested-scope integration coverage for the findings above.
- Declare a supported Python runtime for deployment tooling. System Python 3.9.6
  failed four tests because its `tarfile.extractall` lacks the `filter` argument;
  Python 3.14 passed all seven. Do not remove the extraction filter to accommodate
  an old runtime.
- Continue targeted keyboard/screen-reader checks, live-provider acceptance, and
  real engineer sessions. Existing automated coverage does not establish those.
- Keep the plain JavaScript architecture. Refactor large interaction modules as
  behavior changes require it; a framework rewrite is not justified by this review.

## Verification in this review

- `npm test`: 845 passed, zero failures.
- `/opt/homebrew/bin/python3.14 -m unittest discover -s tests/deploy`: 7 passed.
- Targeted Node reproductions confirmed the three findings above using the
  application's public functions; the storage experiment used a simulated quota.
- `npm run e2e`: 209/209 Chrome checks passed, no console errors or exceptions.
  This run did not supply a KiCad fixture manifest or enable the separate
  presentation-only suite.
- `git diff --check`: passed.

No live deployment, paid-provider request, new native Safari/Firefox run, or human
study was performed. Previous native-browser results remain historical evidence.
