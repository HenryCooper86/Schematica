# Category improvement implementation — 7 October 2026

Implements the user-approved category-readiness roadmap in this checkout.

## Decisions and boundaries

- Preserve plain JavaScript, Node >=22, local-first storage, static Pages, English/Chinese UI, and existing serialized boards.
- Stay in /Users/admin/Schematica; no alternate checkout, external project, framework replacement, or paid service.
- Ship a short review walkthrough, explicit teaching references, accessible wiring, stable KiCad re-import, and optional shared reviews.
- Team identity uses operator-issued high-entropy bearer credentials, stored hashed in an external configuration file; token possession identifies its assigned account. No passwords, email delivery, identity-provider signup, or claims of independently verified personal identity.
- Shared reviews are optional, server-backed and disabled until an operator configures persistent private storage and identities. Use immutable snapshots, SHA-256 content identity, serialized atomic file writes, optimistic version checks, editor/reviewer roles and project membership. New revisions never inherit approval. Credentials never enter board files, URLs, logs or browser persistent storage.
- Build validation collection/analysis tools and deterministic regression cases. Participant studies, private team fixtures, physical-laptop/device trials and live-provider results cannot be invented. Production configuration, participant outreach and deployment are not part of local implementation.
- The user subsequently authorized commit, push to main and deployment after local verification. Existing audit documentation remains intact.

## Tasks and acceptance

1. Guided review and keyboard wiring (src/ui/onboarding.js, new focused helper/UI modules, src/main.js, translations, tests).
   Add a short UART review path: recover current board before loading, introduce a visible rate mismatch, use real checks, repair via the interface editor, export and undo. Keep the sensor starter. Add a keyboard-accessible connection form using existing ports/bus validation/store undo, with locked/missing/unsupported endpoints rejected. Add illustrative power/I2C/CAN reference examples if complete declarations can be authored honestly; identify all assumptions. Test readiness, mismatch, repair, stale switching and meaningful keyboard flows.
2. Stable interchange (src/kicad.js, import UI, tests).
   Generate stable component/net/pin IDs from source identities instead of array positions; reject ambiguity. Add preview/apply re-import of imported boards, preserve layout and annotations of surviving items, retain explicit missing allocation targets, reject stale previews, one undo step. Preserve legacy import behavior and bounded input checks; do not infer electrical declarations. Test reordered input, additions/removals/rewires, round trip, legacy safety and stale apply.
3. Shared review service (new server/team-*.js, server/index.js, tests).
   Implement authenticated optional API with per-project memberships and editor/reviewer permissions; immutable revisions, revision-bound comments, resolution, approval/request-changes, export, optimistic conflict handling, durable atomic writes and credential revocation. Test two identities, unauthorized access, stale writes, stale approval, malicious input, concurrent writes and restart. Do not enable the service on production.
4. Shared review UI (new src/ui/team-review.js, engineering UI, translations, docs).
   Connect to same-origin optional API using memory-only credential; inbox/project creation/revision publishing/reading/commenting/reviewing/export. Explicitly show snapshot identity and stale local designs; never silently replace local work. Read-only service absence explains static mode. Test actual browser/API integration.
5. Validation and operations (scripts, fixtures, docs, tests/e2e/performance.mjs).
   Add strict study result recording/summary without invented data, assistant evaluation case/rubric artifacts and result validation, 30-sample performance measurements with warmup and clearly distinguished renderer/frame metrics, reproducible availability/revision checks and recovery drill instructions. Test malformed/empty inputs and failure exits. Update completion ledger with actual evidence and remaining external inputs.
6. Integration review and verification.
   Review task diffs, resolve findings, run npm test/lint, focused and full Chrome workflows, native browser checks where available, deployment tests and diff checks. Record exact counts and limits.

## Review focus

- Replacing a board while asynchronous recovery is pending must not overwrite new user work.
- Stable source identity must never merge distinct components, pins or ambiguous nets.
- Credentials and private review data must not leak through static serving or errors.
- Concurrent review writes must fail visibly or serialize without losing records; permission revocation applies immediately.
- A passing synthetic study or model fixture must never be presented as real participant or provider evidence.

## Progress

- Planning: complete. Native implementation with scoped subagents and independent review as directed by the subagent-development skill. No parallel implementation agents.
- Task 1: complete and independently reviewed. 14 focused Chrome checks; 91 focused Node/i18n/example tests; full Node 955 at task completion. Active-batch async recovery finding fixed with three red-to-green regressions; helper set24/24 and scoped re-review approved.
- Task 2: complete and independently reviewed. All five findings fixed: electrical part replacement, authored pin declarations, pin ordering, journey ID bounds and merged-port normalization collision. 34 focused tests; Chrome9/9; native integrated workflows included.
- Task 3: complete and independently reviewed. Optional private service, token provisioning CLI and operator docs implemented. Review found queued writes after directory-sync failure; regression fixed and independently rerun. 9 backend/storage tests, 26 combined focused tests pass; normal close drains writes, failed persistence rejects queued writes.
- Task 4: complete and scoped UI review fixes verified. Memory-only client and immutable snapshot UI implemented, translated and styled. Disabled server and two-account real Chrome integration16/16; mobile layout included. FormData-before-disable, failed login cleanup and close/reopen races fixed. Browser screenshots inspected.
- Task 5: complete for locally executable tooling, independently reviewed; evidence tools implemented; 6 focused tests pass. Independent review found and verified correction of incomplete baseline comparisons. Both live point-in-time release checks pass. 30-sample benchmark completed at all three sizes; 1,000-node drag median 3.8 ms/P95 4.5 ms; two-animation-frame scheduling proxy median 33.3 ms/P95 34.3 ms. Evidence in docs/validation/performance-2026-10-07.json. Real participants, model runs and physical devices remain external inputs.
- Task 6: complete. Fresh Node985/985; lint and diff checks pass; Chrome main263/263, workflow17/17, responsive168/168; Firefox116/116 and Safari116/116 including actual shared-review service; deployment Python3.14 tests7/7 without skips. Final whole-change review has no remaining findings; test-harness navigation and checklist selector corrections separately reviewed. See [final implementation report](category-release-2026-10-07.md). The user subsequently authorized release; hosted CI and deployment outcomes are recorded in GitHub Actions.
