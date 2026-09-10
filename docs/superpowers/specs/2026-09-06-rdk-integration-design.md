# D-Robotics RDK integration design

Date: 2026-09-06
Status: Written design approved by the user on 2026-09-06; implementation authorized.
Baseline: `1bd5737` — assistant uses OpenAI compatibility for Ollama.

## Intended outcome

Schematica will support designing an RDK system with model-specific hardware information, checking documented connection constraints, explaining the corresponding TogetheROS.Bot software pipeline, and exporting a setup guide. The palette, properties panel, checker, examples, and assistant will use one maintained catalogue.

A user can select an RDK X5, connect a documented stereo camera, see that it consumes two CSI connectors, add the perception software stages, ask the assistant to explain the design, and download a guide with relevant official documentation. Choosing another board reports any resulting incompatibilities while preserving the drawing.

## Scope

This is one integration delivered in four dependent parts: catalogue and profile resolution; compatibility checks and properties; assistant support; starter diagrams and guide export. Software pipeline blocks are descriptive architecture, not executable ROS projects.

Initial detailed board profiles cover RDK X3 and RDK X5. RDK S100 and S100P receive separately sourced capability profiles; rules apply only to documented interfaces and requirements. Existing X3 Module presets stay available and explicitly distinguish the module from a carrier-board assembly. Carrier-dependent connectors and power are not inferred from the module name. X5 Module, Ultra, and S600 are discoverable through official resource links but are not promised as complete hardware profiles in this release.

Peripheral coverage includes existing RDK camera presets and the explicitly named GS130W and GS130WI stereo cameras. Existing general-purpose IMX219, IMX477, and OV5647 presets remain usable, with compatibility tied to a documented module/adapter combination where that distinction matters. A sensor name alone does not establish connector or driver compatibility.

This release remains a static browser application with no runtime dependencies. It does not connect to devices, collect credentials, execute commands, flash hardware, deploy agents, or generate a runnable ROS workspace. RDK Studio and ROS project integration are subsequent releases.

## Evidence and current shortcomings

- `src/presets.js` stores vendor details as free text, without source URLs, compatibility relationships, revision information, or a distinction between known and unknown capabilities.
- All `aisbc` nodes use the same ports in `src/palette.js`. A part-number change does not change its capabilities.
- `src/drc.js` checks general wiring and lifecycle conditions, but cannot evaluate board-specific port availability, stereo requirements, or RDK software support.
- `src/ai/tools.js` exposes only generic parts and preset notes. `src/ai/context.js` does not describe a selected product's connection constraints.
- `src/examples.js` contains an X5 rover, including a generic stereo camera represented by a single CSI wire. Its title and stable example ID should survive the update, while its topology and captions are corrected.
- `src/serialize.js` currently validates wire endpoints against generic part definitions. Adding a profile must not cause existing valid saved endpoints to disappear on load.

### Source policy

Use the maintained [RDK Resource Center](https://d-robotics.github.io/rdk_doc_center/en/) as the entry point. The [archived manual notice](https://d-robotics.github.io/rdk_doc/en/Quick_start/) dates the migration to June 10, 2026. The new center still labels portions of X3/X5 documentation as unavailable, so archived hardware references remain necessary and must be labelled as such.

Each catalogue record includes official source links and a `checkedOn` date. Record a hardware revision or software target where the source specifies one. Distinguish documented support, an explicitly unsupported combination, and an unverified combination. Absence from a compatibility list is not proof of incompatibility.

The following observations anchor the implementation:

- The [X3 hardware guide](https://d-robotics.github.io/rdk_doc/en/Quick_start/hardware_introduction/rdk_x3/) describes one CSI connector on the development board and separates it from the X3 Module carrier. Its board supply guidance is 5V/3A. Correct the current two-CSI preset description and avoid conflating module and carrier requirements.
- The [X5 hardware guide](https://d-robotics.github.io/rdk_doc/en/Quick_start/hardware_introduction/rdk_x5/) is the hardware reference for connector and power modelling. The [accessory list](https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/) provides published module/adapter combinations; use those combinations rather than generalizing from a sensor chip.
- The [stereo camera overview](https://d-robotics.github.io/accessories_stereo_camera_doc/en/overview/) distinguishes GS130W from GS130WI and lists compatible RDK platforms. The [GS130W installation guide](https://d-robotics.github.io/accessories_stereo_camera_doc/en/stereo_camera_gs130w/installation/) requires two ribbon cables. Model the two camera connections separately.
- The [current TogetheROS.Bot guide](https://d-robotics.github.io/tros_doc/en/tros/) describes sensor acquisition, BPU inference, codecs, image processing, visualization, and board-specific application support. The [inference example](https://d-robotics.github.io/tros_doc/en/quick_demo/ai_predict/) has its own platform/runtime restrictions; a general platform feature must not imply that every example runs on every board.
- [RDK Studio's feature guide](https://d-robotics.github.io/rdk_studio_doc/en/product-intro/feature-matrix/) documents CLI workflows. This is a reference for future integration, not evidence of a browser API or permission to control a device.

## Shared catalogue

Create `src/rdk/catalogue.js` for data and pure lookup functions. It must not import DOM, storage, providers, or the palette. Use stable IDs such as `rdk-x5`, `rdk-x3`, `rdk-s100`, `rdk-s100p`, `gs130w`, and `gs130wi`.

Records contain:

- Identity: stable ID, display name, generic palette kind, canonical part number, exact aliases, and product class (development board, module, peripheral, or software component).
- Provenance: titled HTTPS source links, date checked, archive status, and applicable revision/runtime notes.
- Capabilities: supported architectural interfaces, individual connector IDs for exclusive connections, and connector/adapter requirements. Unknown capability is represented explicitly rather than defaulting to supported.
- Power: documented board input range and supply recommendation, kept distinct from GPIO signalling voltage and peripheral output rails.
- Compatibility: specific board IDs with documented support, explicit exclusions when documented, and requirements such as carrier or adapter boards.
- Software guidance: links to relevant packages and official walkthroughs, scoped to the supported board/runtime.

Match profiles by generic kind plus an exact, case-insensitive canonical part number or registered alias. Never infer a profile from labels, free-form notes, substring matches, or model output. The generic `RDK Stereo Camera` name remains a legacy product identity; it must not silently become GS130W or GS130WI.

Generate RDK preset entries from this catalogue so the preset notes, assistant data, and properties do not become separate competing sources. Preserve non-RDK vendor presets.

## Ports and saved-document compatibility

Add `src/rdk/profiles.js` to resolve a node's catalogue profile and effective ports. Generic `getPart(kind)` remains the definition of a palette kind. A node-aware resolver supplies its model-specific connection choices to rendering, manual wiring, and AI connection resolution.

Retain existing generic endpoint IDs when their meaning is unchanged: `vcc`, `gnd`, `eth`, `usb`, `uart`, `canfd`, `csi1`, `csi2`, `i2c`, `gpio`, `spi`, and `uart2`. New stereo endpoint IDs distinguish left and right CSI connections. Deserialization accepts the union of known profile ports for that generic kind together with its original generic ports. This keeps a stereo endpoint intact even after the user selects another camera model. Rendering retains a visible invalid endpoint for any preserved wire whose port is unavailable in the current profile; new wiring choices use only currently supported ports.

When a user changes a profile:

1. Recompute available connection choices from the new profile.
2. Preserve all existing nodes, wires, positions, annotations, and IDs.
3. Keep an existing unsupported endpoint visible as an invalid legacy connection; show a checker finding explaining the conflict.
4. Do not offer unsupported ports as valid targets for new connections. Explicit AI attempts to use unavailable ports fail with a useful error before applying the batch.
5. Undo restores the previous profile and connections in one step.

No new required document field or schema-version increase is needed for profile selection: it derives from existing `kind` and `sublabel` fields. This intentionally avoids reclassifying unknown product names. New software fields use the existing per-kind `fields` facility, whose serialization and validation must be extended with their part definitions.

Update all consumers that interpret node ports consistently: renderer, pointer wiring, serialization, DRC, AI operations, and AI context. Generic catalogue/search rendering continues to show generic kinds with product suggestions.

## Compatibility checks

Implement pure `checkRdk(doc)` in `src/rdk/checks.js`, called by `checkDoc`. Findings retain the existing `{level, rule, message, ids}` interface and carry relevant node/wire IDs for highlighting and AI fixes.

| Rule | Trigger | Result |
| --- | --- | --- |
| `rdk-interface` | A known profile is wired through an explicitly unavailable connector | Error explaining the selected board and connector |
| `rdk-csi-capacity` | A physical CSI connector is assigned to more than one camera input | Error naming competing wires; count distinct endpoints, not wire direction |
| `rdk-stereo-links` | A known stereo camera lacks either required connection, repeats one board connector, or connects its pair to different boards | Error explaining the required pair |
| `rdk-compatibility` | A combination is explicitly unsupported, or requires an adapter that is missing | Error for an established conflict; warning for an unverified pairing |
| `rdk-power` | An explicit, parseable board supply is outside the recorded input range | Error; unknown or complex rail text is not guessed |
| `rdk-software` | A software block explicitly targets a board/runtime excluded by that component's documented support | Warning with the relevant documentation reference |

Only treat physical point-to-point connectors as exclusive. I2C, power, GPIO abstractions, and other intentionally shared connections must not inherit CSI occupancy rules. USB hub topology and aggregate bandwidth simulation are outside this release.

Power validation uses explicit board input information and directly connected labelled supply outputs. It does not compare every connected part's rail, infer voltage through arbitrary regulators, or confuse a board's 5V input with its 3.3V GPIO. Current annotations describe supply requirements; they do not establish a measured current budget.

Unknown products and carrier-dependent assemblies receive helpful unverified/requirement messages, not invented certainty. General checker success means no implemented rule found a problem; assistant copy must not present it as hardware certification.

## User experience

### Palette and properties

Continue using the existing palette search and Part number selection. Searching RDK, a board model, or a camera model finds its generic kind and named presets.

For a recognized product, show an RDK details section in the properties panel:

- Exact profile name and source date.
- Available architectural interfaces and camera connector occupancy.
- Supply requirement and necessary adapters/carrier notes.
- Known compatible peripherals or board targets.
- Official hardware, software, and quick-start links.
- A Download setup guide button when the document contains an RDK board.

The panel follows the existing visual style. Escape all catalogue and user-derived text, validate links against allowed HTTPS schemes, and use safe external-link attributes. No extra account or provider setup is required.

### Software pipeline representation

Add a generic robotics software component kind with distinct logical input/output ports and fields for package/component, runtime, and target board ID. The target is chosen from existing RDK nodes; stale references after deleting a board produce a finding rather than deleting the software block.

Initial curated components describe sensor acquisition, BPU inference, image encoding, and visualization. Connect stages with the existing logical `flow` bus. Physical buses terminate on hardware; logical flow edges express data movement without pretending to be electrical wiring. Exact ROS topic names are user annotations unless a particular documented recipe establishes them.

### Assistant

Add one read-only `rdk_reference` tool with a query string. It searches catalogue records and returns compact source-linked capability, compatibility, and software guidance. Exact profile details are also included for recognized nodes in `get_board` and in preset results. The stable prompt includes a concise RDK usage rule; it does not embed the full documentation corpus.

The assistant must inspect the selected profile before proposing RDK connections, use declared software support, and distinguish a documented capability from a design assumption. It can add software blocks through existing atomic edit operations. Existing undo, cancellation, tool-call limits, and provider behavior remain in force.

Single-shot providers receive a bounded summary of relevant selected-board profiles with their current board context, so basic RDK constraints are not exclusive to tool-capable models. Detailed lookups remain available only through tools.

## Starter diagrams and setup-guide export

Correct the existing `rdk-rover` template and add an RDK X5 perception starter. Each includes substantial hardware wiring, logical software flow, grouped subsystems, and at least three explanatory journey steps.

The perception starter uses the two physical CSI connections for its stereo module. A third MIPI camera cannot share those connectors. The rover starter must also model protocol conversion explicitly where required; a UART connection is not directly labelled RS-485 without an appropriate adapter. Remove unsupported claims about specific servos or cameras from the starter rather than disguising them with a generic bus label.

Create `src/rdk/guide.js` with a pure `rdkGuide(doc)` Markdown generator. The user downloads a `.md` file through the existing browser download pattern. The guide contains:

1. Board title and identified RDK profiles.
2. Components, physical connections, and required adapters.
3. Logical software stages and any explicit runtime selections.
4. Current findings and unresolved compatibility questions.
5. A preparation checklist and official installation/example links appropriate to the identified board.
6. Source dates and the distinction between design validation and tests executed on hardware.

Do not emit guessed shell commands or interpolate arbitrary board text into executable commands. This release supplies a reproducible design handoff and verified references, not an executable installer. Export is a user action; the AI reference tool is read-only.

## Files and responsibilities

| Area | Files |
| --- | --- |
| Product data and lookups | New `src/rdk/catalogue.js`; update `src/presets.js` and `src/search.js` |
| Node profile/port resolution | New `src/rdk/profiles.js`; update `src/palette.js`, `src/render.js`, `src/tools.js`, `src/serialize.js` |
| Compatibility findings | New `src/rdk/checks.js`; integrate in `src/drc.js` |
| Properties and guide download | Update `src/ui/props.js`; new `src/rdk/guide.js`; existing stylesheet for the RDK details section |
| Assistant | Update `src/ai/tools.js`, `src/ai/context.js`, `src/ai/ops.js`, `src/ai/prompt.js` |
| Templates | New `src/rdk/examples.js`, imported by `src/examples.js`; preserve the existing rover ID |
| Verification | New RDK unit tests plus targeted updates to serialization, rendering, AI, examples, and `tests/e2e/smoke.mjs` |
| Documentation | Update `README.md` with the supported scope and limitations |

Catalogue lookup returns data or null, profile resolution returns generic definitions for unmatched products, checks always return an array of findings, and guide generation returns Markdown for documents containing an RDK board. The export control is hidden when none is present.

The dependency direction is catalogue → profiles/checks/guide → existing application consumers. The catalogue never depends on the palette or the UI, preventing import cycles when presets are generated from it.

## Acceptance criteria

1. Selecting X3 and X5 produces different documented CSI availability; generic AI SBCs still behave as generic parts.
2. GS130W/GS130WI connections require two distinct supported CSI endpoints. Missing, duplicate, split-board, and oversubscribed connections are caught with actionable findings.
3. Unknown products are not silently treated as a supported RDK product. Module/carrier assumptions are visible.
4. Changing profiles preserves existing wires and reports conflicts; undo restores the prior state. Existing documents survive load/save with their endpoint IDs intact.
5. Palette, properties, checker, preset results, AI board text, and reference tool agree on the same product data and sources.
6. The assistant can look up an RDK product, build a valid small design, receive a meaningful error for an unavailable connector, and finish with one undoable edit batch.
7. Both RDK starter diagrams serialize without warnings and pass all applicable RDK rules; their intended remaining general findings are documented and tested explicitly.
8. The downloaded setup guide matches the current board and findings, contains official links, and includes neither AI credentials nor executable content derived from arbitrary annotations.
9. `npm test` and `npm run e2e` pass. Browser smoke coverage includes profile selection, conflict display, preserved wires, guide download, and the assistant reference tool.
10. No physical-hardware validation is claimed without a connected board and recorded results. No device access is required to use this release.

## Follow-on work

A later release can introduce target-specific ROS 2 project exports. Live board discovery and RDK Studio CLI integration require a separately designed local companion and explicit device identity/connection handling. The shared catalogue and descriptive pipeline provide inputs to those features without embedding a device-control subsystem in this release.
