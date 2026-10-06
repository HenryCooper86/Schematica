# Category readiness review — 7 October 2026

Reviewed application commit `f165df7cecc1a32b51930ad09e23c90e33f4ff77`.
Assessment: a credible foundation for fast embedded-system architecture reviews,
with significant adoption and validation gaps. Category leadership is not yet
demonstrated. Passing tests establishes specific behavior, not market leadership,
hardware correctness, or an absence of defects.

## Product focus and comparison

Recommended audience: embedded/hardware architects and their firmware and review
partners. The outcome to win is **turn an architecture change into a clear,
evidence-linked interface review and portable handoff with little setup**.
This is a proposed positioning based on the existing product, not a measured
customer preference. Preserve local editing, portable documents, and explicit
unknowns as part of that proposition.

The following adjacent tools establish useful expectations. These observations
come from official documentation checked for this review, not hands-on comparative
timings or an exhaustive market survey. Products serve different scopes; inclusion
does not establish that every feature should be copied.

| Reference | Documented capability | Implication for Schematica |
| --- | --- | --- |
| [System Composer](https://www.mathworks.com/products/system-composer.html) | Architecture interfaces, requirement allocation, model views, analysis, and connections to simulation and interchange workflows. | Review traceability and useful handoff are essential. Simulation and model exchange remain a different depth of capability. |
| [Eclipse Capella](https://projects.eclipse.org/projects/polarsys.capella/governance) | Guided architecture methodology, filters, reusable model elements, and extensible viewpoints. | A coherent guided workflow and reusable engineering knowledge matter as much as drawing tools. |
| [Flux](https://www.flux.ai/p/organizations) | Team spaces, project permissions, automated version history, and schematic comments. | Shared review ownership and access control are meaningful gaps for team adoption. Flux also serves a PCB design workflow. |
| [draw.io](https://www.drawio.com/docs/manual/collaboration/share-diagrams/) | Sharing through storage platforms and real-time collaboration on supported platforms. | Familiar sharing and collaboration are established expectations even in general diagramming. |

Recommended strategy: excel at architecture review and interchange with the
tools engineers already use. A full PCB editor, simulation engine, broad MBSE
metamodel, or framework rewrite would dilute that near-term focus without evidence
that those changes solve the next adoption blocker.

## What is already substantiated

| Capability | Repository evidence | Boundary |
| --- | --- | --- |
| Interface-aware review | `src/interface-checks.js`, `src/validation-coverage.js`, `src/ui/interface-guide.js` | Checks compare supplied declarations. They do not establish electrical validity or validate source contents. |
| Safe, understandable changes | `src/ai/preview.js`, `src/ui/change-preview.js`, `src/impact.js` | Preview, stale-document rejection, undo, scoped impact and stale evidence are implemented. Live model quality needs a separate evaluation. |
| Portable engineering handoff | `src/review.js`, `src/review-html.js`, `src/workflows.js` | Offline reports, requirements, verification records and review exchange exist. Reviewer names are local records, not authenticated identities. |
| Recovery | `src/revisions.js`, `src/revision-db.js`, `src/autosave.js` | Named snapshots and conflict handling exist. Same-device browser storage is not an off-device backup. |
| Large-board rendering | [October measurements](enhancements-2026-10-06.md) | 1,000-node drag redraw median was 4.7 ms on one Mac. This is synchronous renderer work, not input-to-paint latency. |
| Release reliability | `.github/workflows/ci.yml`, `deploy/lightsail-release.py` | CI gates both deployments; activation checks and rollback exist. Availability history and a full host-loss recovery drill are separate evidence. |

## Reproduced gap: the first successful review requires too much setup

Running `reviewReadiness()` against every built-in example produced:

- 28 examples inspected; only `declared-uart-reference` is review-ready.
- 27 examples contain at least one unassessed applicable interface.
- The First project guide loads `sensor-node-clean`. It has 13 applicable
  connections, all unassessed, and zero blocking design findings.

This is not proof that the examples are incorrect: many are architecture sketches
and intentionally leave declarations unknown. It does show a mismatch between a
quick first-success experience and the amount of declaration work in the default
starter. `src/onboarding-progress.js` correctly refuses to mark that work complete.
Do not remove this guard or invent specifications to improve the count.

The compact results are in [example readiness evidence](category-readiness-2026-10-07.json).
Reproduce from the repository root:

```sh
node --input-type=module <<'JS'
import { EXAMPLES } from './src/examples.js';
import { reviewReadiness } from './src/validation-coverage.js';
console.table(EXAMPLES.map(({ id, doc }) => {
  const { ready, blockingFindings, coverage } = reviewReadiness(doc);
  return { id, ready, blockingFindings, applicable: coverage.applicable,
    checked: coverage.checked, failed: coverage.failed,
    unassessed: coverage.unassessed };
}));
JS
```

## Prioritized work and completion criteria

These are proposed deliverables and targets, not completed work or promises of
dates. Small means an existing-flow change; medium means several coordinated
modules and tests; large means a new subsystem and operating commitments.

| Order | Gap and first useful deliverable | Completion evidence | Size |
| --- | --- | --- | --- |
| 1 | Guided first success: offer the existing declared UART reference as a short walkthrough, retaining the sensor starter for open-ended work. Introduce one deliberate incompatibility, fix it, and export the review. Label illustrative assumptions clearly. | Complete by keyboard and pointer; preserve an existing board; undo the deliberate change; exported readiness agrees with the editor. In five engineer sessions, at least four finish without intervention within 10 minutes. | Small–medium |
| 2 | Engineering reference quality: add a focused set of reviewed power, I2C and CAN interface examples, each tied to exact component/document revisions and stated assumptions. Existing RDK sources and `checkedOn` metadata are a foundation. | Independent review of limits and applicability; document revision/page references; unknowns remain unknown; incompatible fixtures fail; examples explicitly distinguish teaching assumptions from verified component data. | Medium |
| 3 | Measure actual advantage: execute the existing engineer study kit, using creation, interface-change review, recovery and handoff tasks against each participant's current workflow. | Five recorded, consented task scorecards; recipient can identify direction, assumptions and stale evidence; no unrecovered data loss or missed critical seeded issue. Proposed pilot target: 20% lower median review-plus-handoff time with no correctness regression. Report all individual results and task order; five sessions are exploratory, not a market-wide claim. | Medium; participants needed |
| 4 | Remove interchange friction: validate the current KiCad XML path on representative team designs; prioritize stable external identifiers and repeatable import/diff before bidirectional synchronization. Add requirements CSV exchange if the trials establish demand. | At least three permitted team fixtures; exact component/net/pin preservation; duplicate IDs, unsupported inputs and removed targets handled explicitly; a repeat import previews additions/changes/removals without silent loss. | Medium–large |
| 5 | Make reviews work across a team: start with a versioned shared review inbox, comments bound to immutable revisions, reviewer/editor roles and authenticated approval. Keep portable local documents. | Two users can review the same revision; a stale approval cannot approve a newer design; concurrent edits preserve both versions; access revocation, export and recovery are tested. Decide hosting, identity and retention before implementation. | Large |
| 6 | Complete keyboard and assistive-technology workflows: accessible part/port selection and connection creation, with meaningful selection and error announcements. | Create, connect, edit, review, export and recover without a pointer; manual screen-reader runs on agreed platforms; no keyboard traps. Existing shortcuts, labels and responsive tests alone do not establish this. | Medium |
| 7 | Prove supported-device responsiveness and reliability: measure end-to-end interaction on representative laptops; retain regression evidence; document service recovery and operational ownership. | 100/500/1,000-node representative boards, warm-up plus at least 30 measured interactions each, P50/P95 input-to-next-paint and memory after repeated open/close; provisional P95 interaction target under 100 ms. Establish device-specific gates from results. Record a production recovery drill, rollback result, recovery time and independent availability checks. | Medium |
| 8 | Evaluate assistant usefulness separately from tool correctness: curated engineering tasks with cited evidence, known unknowns and deliberate conflicting instructions in source material. | Versioned task set, recorded provider/model versions, correct preview/apply/cancel/undo, no unsupported engineering claim accepted as verified, measured completion/correction rate. Existing scripted provider tests are necessary but cannot establish live-model quality. | Medium; provider evaluation inputs needed |

The ordering balances immediate usefulness with cost. Team collaboration is an
important competitive gap, but an authenticated shared workspace is a substantial
architecture decision. Start with asynchronous review; validate demand before
adding simultaneous editing. Interchange should follow real incoming data rather
than a promise to support every engineering format.

## Verification and limits of this review

- Fresh `npm test`: **919 passed**, zero failures or skips.
- Fresh `npm run lint`: passed.
- Fresh built-in example readiness census: 28 inspected, 1 review-ready.
- GitHub confirms successful [CI](https://github.com/HenryCooper86/Schematica/actions/runs/37488226508),
  [Pages deployment](https://github.com/HenryCooper86/Schematica/actions/runs/37488831067)
  and [Lightsail deployment](https://github.com/HenryCooper86/Schematica/actions/runs/37488831189)
  for `f165df7`. This verifies those release events, not ongoing availability.
- Existing release evidence: Chrome 224 checks, targeted Firefox and Safari 78
  each, specialized workflows and deployment tests. Those browser suites were
  not rerun for this documentation-only assessment.
- Source inspection found pointer-based port creation in `src/tools.js` and no
  equivalent keyboard port-connection path in that flow. This is a focused source
  finding, not a completed accessibility audit.
- The reviewed repository contains deployment health checks and rollback, but no
  evidence of an independent uptime history or full host-loss restore drill.
  Monitoring configured outside the repository was not inspected.
- No participant results, comparative competitor timings, new live-provider
  evaluation, hardware tests, penetration test, or new production changes are
  claimed. No users were contacted.

The immediate recommendation is to deliver the short review walkthrough and
validate it with engineers, while preparing representative interchange fixtures.
Use those results to choose the first shared-team workflow. This gives the next
release a specific advantage to demonstrate instead of another broad feature list.
