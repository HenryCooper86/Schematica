# Archify-inspired improvements

Scope agreed in the September 9 review. Implement the interaction patterns in
Schematica's own document model; keep hardware connectivity distinct from simulation.

- [x] Phase 1: board search, bus filters, connection highlighting, reading detail. Pushed e76176f.
- [x] Phase 2: journeys linked to parts and wires, moving targets, missing-target fallback. Pushed a77c4f0.
- [x] Phase 3: standalone offline HTML viewer with search, navigation and journeys. Pushed 1ced643.
- [x] Phase 4: before/after board comparison, separating design edits from movement. Pushed 3b84f78.
- [x] Phase 5: layout quality checks with actionable findings for users and the assistant. Pushed 161e252.
- [x] Phase 6: light theme, export theme support, PNG clipboard copy.

Each phase is tested, committed, and pushed before the next phase.

## Verification

The regular Node test suite covers graph exploration, linked journey resolution,
round-tripping, HTML isolation, snapshot comparison, geometry diagnostics and themes.
The regular browser smoke suite now also exercises linked journeys, revision file
comparison, layout finding selection, light appearance, clipboard success/failure,
and the standalone viewer. `ADOPTION_E2E_ONLY=1 npm run e2e` runs those new paths
without repeating the older editing, document and recording flows.

Intentional boundaries: traversal describes drawn connectivity, layout findings do
not certify hardware, and comparison reports document changes rather than runtime
impact. Full-card movement remains manual unless whole-board arrangement is asked
for. Missing journey references retain their saved camera fallback.
