# RDK Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make RDK product data, connections, design checks, assistant guidance, and starter guides work together in Schematica.

**Architecture:** A pure catalogue feeds preset generation and node-aware profiles. Existing rendering, wiring, serialization, and AI use those profiles; pure checks and guide generation share the same records. No network access is required at application runtime.

**Tech Stack:** Dependency-free browser ES modules, Node test runner, existing Chrome/CDP e2e harness.

**Spec:** `docs/superpowers/specs/2026-09-06-rdk-integration-design.md` (approved).

## Global Constraints

- This release remains a static browser application with no runtime dependencies.
- Match profiles by generic kind plus an exact, case-insensitive canonical part number or registered alias.
- Preserve all existing nodes, wires, positions, annotations, and IDs.
- Absence from a compatibility list is not proof of incompatibility.
- No physical-hardware validation is claimed without a connected board and recorded results.
- No code may contain API credentials. User content is data, never executable code.

## Task 1: Shared catalogue and lossless node-aware ports

**Files:** Create `src/rdk/catalogue.js`, `src/rdk/profiles.js`, `tests/rdk-profiles.test.js`. Modify `src/presets.js`, `src/render.js`, `src/tools.js`, `src/serialize.js`, `src/ai/ops.js`; existing related unit tests only where the supported behavior changes.

**Interfaces:**
- `RDK_PRODUCTS`: array of records `{id,name,kind,sublabel,aliases,productClass,notes,sources,checkedOn,ports,power,compatibility,requirements,software}`. Sources are `{title,url,archived?}`. Ports, when known, are complete architectural port definitions `{id,name,bus,side,offset}`. Unknown port list is `null`.
- `profileFor(node)`: exact kind + sublabel/name/alias lookup, record or null.
- `searchRdk(query)`: word-matched array of product records, capped at 12.
- `rdkPresets(kind)`: standard `{name,sublabel,rail,notes}` records generated from data. Preserve old preset defaults where not contradicted by verified hardware information; never substitute a specific product for a vague legacy name.
- `nodePart(node)`: generic part metadata with supported ports for a recognized complete profile; otherwise generic metadata/ports.
- `knownPorts(kind)`: union of generic and every profile's ports for lossless deserialization.
- `displayPart(node, wires=[])`: supported ports plus any wired legacy ports, tagged `unsupported:true`; unmatched generic products retain foreign preserved ports as unsupported too.
- `profileSummary(profile)`: compact plain text with requirements and source URLs for subsequent tasks.

- [x] **Step 1: Add failing consumer tests.** Use real deserialize/serialize, applyEdits, and diagramMarkup. Independently assert X3 has one available CSI, X5 two, and GS130W has `csi` plus `csi-right`. Generic stereo name must not resolve to GS130W. A saved X3 wire on `csi2` and a changed stereo wire on `csi-right` must round-trip intact and render as invalid. An AI batch trying X3 `csi2` must reject atomically.

```js
const doc = newDoc();
const result = applyEdits(doc, [
  { op:'add_part', ref:'b', kind:'aisbc', sublabel:'RDK X3' },
  { op:'add_part', ref:'c', kind:'mipicam', sublabel:'IMX219' },
  { op:'connect', from:{node:'b',port:'csi2'}, to:{node:'c',port:'csi'}, bus:'mipi' },
]);
assert.equal(result.ok, false);
assert.equal(doc.nodes.length, 0);
```

Use the existing exported EDIT_SCHEMA; the fixture intentionally requests an unavailable X3 connector.

- [x] **Step 2:** Run `node --test tests/rdk-profiles.test.js`, inspect expected missing-feature failures, then implement.
- [x] **Step 3:** Verify official source pages listed in the spec plus S100/S100P hardware references. Record only supported facts. Catalogue X3, X5, S100, S100P, carrier-dependent X3 Module, existing legacy cameras, GS130W/WI, and named generic sensor-module entries without assuming all vendors share compatibility. Populate software records (`hobot_sensor`, `hobot_dnn`, `hobot_codec`, `hobot_render`) with `kind:'rdksoftware'` for Task 3; those records use flow ports and support evidence. Software compatibility uses `boardIds` and runtime strings (`Humble`, `Foxy`, `Jazzy`) only where sourced; `null` is unknown.
- [x] **Step 4:** Implement catalogue lookup and port resolution. Generate RDK presets from data and remove duplicated RDK prose. Keep generic palette ports unchanged; resolve node ports in render/manual wiring/AI. Use the known-port union only for restoration/display, never for accepting new AI connections. Display invalid ports distinctly and prevent pointer wiring from using them. Profile changes must never silently overwrite existing rail/notes.
- [x] **Step 5:** Run `node --test tests/rdk-profiles.test.js tests/presets.test.js tests/serialize.test.js tests/render.test.js tests/ai-ops.test.js`; fix regressions. Commit only Task 1 files and report exact evidence.

## Task 2: RDK compatibility checks

**Files:** Create `src/rdk/checks.js`, `tests/rdk-checks.test.js`; modify `src/drc.js`.

**Consumes:** Task 1 `profileFor`, `nodePart`, `knownPorts`, product records. **Produces:** `checkRdk(doc)` with existing finding shape, and `cameraOccupancy(doc,node)` for UI if useful (document signature in report).

- [x] **Step 1:** Write hand-built board fixtures to test valid stereo pair, missing right link, repeated host connector, split-board pair, reversed wire orientation, unavailable X3 connector, and valid shared I2C. Assert rule IDs and involved IDs, not complete message strings.

```js
const failures = checkDoc(stereoDoc);
assert.equal(failures.some(f => f.rule === 'rdk-stereo-links'), false);
stereoDoc.wires = stereoDoc.wires.filter(w => w.id !== 'right');
assert.ok(checkDoc(stereoDoc).some(f => f.rule === 'rdk-stereo-links' && f.ids.includes('camera')));
```

- [x] **Step 2:** Run `node --test tests/rdk-checks.test.js`; inspect the red assertions.
- [x] **Step 3:** Implement the spec's six rules. Check interface availability for both endpoints, enforce exclusive CSI connectors, validate stereo pairs against actual supported ports on the same board, and distinguish documented conflicts from unverified combinations. An unknown board cannot be asserted compatible merely because it has generic CSI ports. Carrier-dependent products show requirements. Required adapters must be represented by an exact known adapter identity on the actual connection path; if current schema/data cannot establish a path, report unverified instead of assuming an unrelated adapter elsewhere on the board satisfies it.
- [x] **Step 4:** Add power fixtures for a 12V board input into X5, valid 5V input, unknown rail strings, and 3.3V I2C peripherals. Parse only complete numeric volt strings/ranges; do not treat a regulator input as output voltage. Add software fixtures for missing target, deleted target, known unsupported runtime, unknown package/runtime, and a supported combination. Software node fields are `{package,runtime,target}`. Unknown metadata generates a warning without claiming incompatibility.
- [x] **Step 5:** Integrate findings into checkDoc and ordering, using node-aware ports for general port checks. Run `node --test tests/rdk-checks.test.js tests/drc.test.js tests/rdk-profiles.test.js`; commit task files and report.

## Task 3: Software blocks, properties, assistant reference, and guide

**Files:** Create `src/rdk/guide.js`, `src/ui/rdk-details.js`, `tests/rdk-guide.test.js`, `tests/rdk-assistant.test.js`; modify `src/palette.js`, `src/ui/props.js`, `src/ai/context.js`, `src/ai/tools.js`, `src/ai/prompt.js`, `src/ai/ops.js` where target-ref resolution needs it, and `css/style.css`; `src/state.js` and its focused tests for copied software target references.

**Consumes:** Tasks 1–2 catalogue/profiles/checks. **Produces:** `rdkGuide(doc)` returns Markdown or empty string when no RDK board; `rdkDetails(node,doc)` escaped HTML; `rdk_reference({query})` tool output; `rdksoftware` kind fields `{package,runtime,target}` with input/output flow ports.

- [x] **Step 1:** Write failing integration tests against real createExecutor: query X5 and GS130W, unknown query, get_board includes connector constraints/source, tool call does not mutate Store, AI adds a software node and resolves its target ref to an existing/new board ID, serialize/deserialize preserves fields. Existing single-shot board context must include concise relevant profiles.

```js
const before = serialize(store.doc);
const result = executor.run('rdk_reference', {query:'GS130W'});
assert.equal(result.isError, false);
assert.match(result.text, /csi-right/);
assert.match(result.text, /https:\/\/d-robotics/);
assert.equal(serialize(store.doc), before);
```

- [x] **Step 2:** Write guide tests: board-specific BOM and endpoints, findings present, software target mapping, official sources, no commands, hostile title/labels escaped to harmless Markdown, empty document yields no guide. Verify the generator's only input is a document, not settings or provider state. Run focused tests and inspect red results.
- [x] **Step 3:** Add software kind and presets, source-linked assistant reference lookup, profile summary in get_board/node context, and a concise prompt rule to look up RDK constraints and avoid hardware-certification claims. Keep the reference tool capped. Clarify tools receive data, not instructions. Do not expose command execution or new AI mutations beyond existing atomic ops.
- [x] **Step 4:** When duplicating a selected board and software stage together, remap the copied stage target to the copied board; copying only the stage keeps its original target. Cover both with real state tests. Reuse `src/export.js` download helper for its existing Blob lifecycle. Render compact RDK details in properties: identity/date, supported ports, CSI occupancy, power/adapters, compatibility, links. Software properties select target from existing RDK board nodes and retain a missing target value visibly. A user-triggered Download setup guide button is available for an RDK board and emits Markdown using Blob and a temporary download anchor; revoke the object URL. Escape text and allow only HTTPS links. Style within existing panel proportions.
- [x] **Step 5:** Run new unit tests plus existing palette, search, presets, AI tools/context/ops, serialize, and render suites. Update prior fixed tool-count tests to the intentional added reference tool. Commit task files and report.

## Task 4: Corrected starter diagrams and end-to-end verification

**Files:** Create `src/rdk/examples.js`, `tests/rdk-examples.test.js`; modify `src/examples.js`, `tests/examples.test.js`, `tests/e2e/smoke.mjs`, `README.md`.

**Consumes:** Tasks 1–3 APIs. **Produces:** corrected `rdk-rover` and new `rdk-perception` entries integrated into EXAMPLES, with zero RDK findings and stated generic limitations.

- [x] **Step 1:** Assert existing rover's CSI topology is correct and no direct UART-to-RS485 connection is presented as valid. Add tests for the new perception starter: GS130W/WI has distinct left/right CSI host endpoints, software blocks point at its X5, both serialize without warnings, each has at least five nodes, four wires, a zone, and three meaningful journey steps. Run red tests.
- [x] **Step 2:** Build templates with literal product identities drawn from the shared data. Stereo uses both X5 connectors; any additional camera uses an appropriate independent interface or is omitted. Remove the legacy unsupported gimbal shortcut; do not fabricate an adapter product. Include software nodes and logical flow, power/ground where meaningful, and clear design assumptions. Keep the original rover ID/title stable. Do not mark hardware as tested.
- [x] **Step 3:** Extend the existing CDP smoke harness to select profiles, display model-specific ports and source links, show a stereo conflict, change profiles without losing wires and undo it, select a software target, export and inspect the Markdown guide, and exercise rdk_reference in the fake AI provider path. Use disposable e2e boards, not the user's live OTA board.
- [x] **Step 4:** Run `npm test` and `npm run e2e`. Update README for supported profiles, descriptive software pipelines, docs/archive dates, and hardware validation limits. Commit task files.
- [x] **Step 5:** Obtain broad code review of the entire branch, address material findings with regression tests, rerun affected checks, and present the completed integration. Existing approval authorizes implementation; do not ask again between tasks. Keep publishing status explicit and only claim deployment if actually performed.

## Completion evidence

Completed 2026-09-06. Product changes verified at `b0a9861`: 355 unit tests and 93 browser smoke checks pass with no browser console errors. All four task reviews and the final whole-branch review approved. Final review fixes cover complete guide findings/assumptions/preparation, documented peripheral discovery, and dated assistant preset references.

The integration remains a static design tool. S100/carrier connector assemblies and exact software runtime compatibility remain explicitly unverified where the catalogue lacks evidence. No physical hardware/runtime execution or deployment was performed for this release.
