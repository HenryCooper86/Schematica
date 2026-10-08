# Editor reference

[Documentation home](README.md) · [User guide](user-guide.md) · [Troubleshooting](troubleshooting.md)

Use this page for detailed control behavior and limits. For a first session,
start with [Getting started](getting-started.md).

## Controls at a glance

| Action | How |
|--------|-----|
| Add a part | Drag it from the palette, or click it |
| Wire two parts | Drag from a port to another port (any tool), or use **Connect ports** for keyboard endpoint selection |
| Pick the bus type | Automatic when both ports agree; popover otherwise |
| Re-attach a wire | Select it, then drag either end handle onto another port (the bus follows the new ports, or asks) |
| Select / move | `V`, click or drag; marquee on empty canvas; shift-click adds |
| Select all | `Ctrl/Cmd-A` — every card, zone, and note, exactly what a marquee across the whole board picks up |
| Zone | `Z`, drag a rectangle (select it by its border or title); drag a corner handle to resize; dragging a zone carries the cards inside it |
| Find a part | Type in the palette search — names, categories, buses, or vendors (RDK, Journey) |
| Explore the board | **Explore** or `/` searches placed parts by name, part number, address, fields, or supported bus. Enter focuses the first result; Arrow Down moves to results. Filter drawn connections by bus, then select a part to highlight immediate neighbors or its connected network. Unrelated items are dimmed and remain editable. |
| Reading detail | In Explore, choose Overview, Normal, Detailed, or Automatic with zoom. Overview hides secondary card text and wire labels; Normal keeps part numbers and wire labels; Detailed shows everything. Selection and highlighted connections reveal their details at every zoom. Geometry, ports, status tags, and warning badges stay in place. Reset exploration restores the full view. |
| Nudge | Arrow keys move the selection 1px; `Shift` + arrow moves a grid step |
| Align / distribute | Select two or more items — the Align group in the properties panel lines up their left, horizontal-centre, right, top, vertical-middle, or bottom edges. Three or more can be spread to equal gaps across or down. Tidy spacing packs the selection to one gap you choose along the axis it already runs on |
| Fold a panel | The ▾ in the properties or journey panel header folds it to a bar; remembered across reloads |
| Hide the panels | `P` or the panels button hides the properties and journey panels entirely; press again (or open Journey) to bring them back; remembered across reloads |
| Hide the palette | `B` or the palette button hides the parts palette so the canvas takes the full width; press again to bring it back; remembered across reloads |
| Sticky note | `N`, click |
| Rename anything | Double-click its text, or use the properties panel |
| Pan / zoom | Space-drag or middle-drag; scroll wheel |
| Undo / redo | `Ctrl/Cmd-Z`, `Ctrl/Cmd-Shift-Z` |
| Duplicate | `Ctrl/Cmd-D` |
| Copy / cut / paste | `Ctrl/Cmd-C`, `Ctrl/Cmd-X`, `Ctrl/Cmd-V` — within a board, into another board, or into another tab; a cut keeps locked items and says how many |
| Lock | `K`, or the Lock toggle in the properties panel (Lock all / Unlock all for a multi-selection) — a locked node, zone, or note cannot be dragged, nudged, resized, or deleted, and wears a small padlock |
| Delete | `Delete` / `Backspace` — a mixed selection loses its unlocked items and a notice says how many locked ones were kept |
| Keyboard shortcuts | `?` or the **?** button in the zoom group — every shortcut, grouped, with ⌘ or Ctrl to match the platform |
| How to use | Book icon and **How to use** in the toolbar — opens the website guide in another tab, with a quick start, common tasks, troubleshooting and the same shortcut reference |
| Save / open | Toolbar — downloads/reads `*.schematica.json` |
| Export | Export button — PNG at any pixel size, SVG, single-page PDF, or a seamless loop GIF, cropped to content |
| Record | Rec button — WebM/MP4 video (optional mic or music audio) or animated GIF |
| Journey | Save chapters and ordered part stops with captions; Present has chapter navigation, play/pause, speed, restart, show all, and exact moment links (arrow keys, Space, Esc) |
| Examples | Examples menu — built-in boards from sensor nodes to edge-to-cloud, including D-Robotics RDK X3, X5 and S100 robots and perception nodes, Horizon Mono 2, Journey 6 and SuperDrive HSD 600 ADAS stacks, a sensor starter for general design checks, vehicle OTA and ADAS security boards that mix threat actors, controls, and response flowcharts with the hardware, an EV battery management system, a plant network segmented by Purdue level on a swimlane, and a secure boot chain, journeys included. Additional boards cover signed AI model delivery, robot command trust boundaries, RDK X3 USB vision, RDK X5 visual inspection, Horizon Journey 6 sensor replay and diagnostic access |
| Language | 中文 / EN button in the toolbar — switches the interface, palette, checker messages, the copilot's replies, and the built-in example boards between English and Simplified Chinese; English by default; remembered on this device; your own boards' text is never translated |
| Presets | Part number field — on AI SBCs, automotive SoCs, ADAS controllers, cameras, depth cameras, LiDARs, and serial servos, pick a vendor part (D-Robotics RDK boards and camera modules, Horizon Journey chips and Mono / SuperDrive tiers, and more) to fill the rail and a spec note |
| Threat details | Threat parts carry their own fields instead of the part-number trio: STIX vocabularies (actor type, sophistication, motivation, malware type), references (CVE, CVSS, ATT&CK technique), and a severity from info to critical that shows as a colored tag. Every part can also carry a disposition (friendly, partner, neutral, unknown, suspicious, adversary, victim), shown as a tag beside the lifecycle status; adversaries and suspicious objects glow with a halo that pulses whatever the Animate toggle says, victims wear a steady one, and the properties panel is headed by the part's name. Network, Security & Edge, and System & Cloud host parts (server, database, cloud, host PC) carry IP address and DNS name fields under their part number |
| Animate | Animate toggle — traffic dashes flow along wires and Bug/Thermal alerts pulse; off by default, so a freshly opened board's wires are still, and a wire's own "Always" flow setting keeps just that wire moving; adversary glows pulse regardless; captured in recordings |
| Pan | `H` or hold Space — dedicated hand tool |
| Fullscreen | ⛶ button in the zoom group |
| Export dialog | Pixel dimensions with aspect lock and a transparent-background option that PNG and SVG both honor |
| BOM | BOM button — bill of materials grouped by part number (qty, refs, addresses, rails, typical current, status, flags), with a board total; CSV download or Markdown copy |
| Power budget | Give consumers a Typical and Peak current, supplies and regulators an Output current limit, fuses a Current rating, and batteries a Capacity. Check adds them up per power rail and lists every rail under its Power tab; the BOM totals them. Written as `250mA`, `0.25 A`, `3.6uA`, `2 Ah`, or a bare number meaning milliamps |
| Share | Share button — the whole board compressed into a copyable URL; opening the link loads it, no backend. Opened over a board you were working on, the link loads at once, keeps your board as a backup, and the notice offers to restore it |
| Check | Check button — design rule checks: I2C address conflicts, unconnected power pins, floating parts, bus mismatches, lifecycle risks, power budgets (the sensor starter still needs structured interface declarations), plus Layout quality and a read-only Power tab listing every rail |
| Assistant | `A` or the sparkle button — describe a board and it builds it, ask for a change and it edits the board, press Fix on a check finding or "Fix checks" and it resolves them, "Fill in details" fills part numbers from presets. Add files, a folder, or drop individual files to use local documents as sources; review, select, preview, or remove them before Send. Bring your own key: Claude by default, plus OpenRouter, Z.AI GLM, Moonshot Kimi, and any OpenAI-compatible endpoint. With `npm start`, your own backend calls the official provider URLs and streams replies, including Ollama Cloud via `https://ollama.com/v1`. The static edition still supports the optional worker in `relay/`. Each reply is one undo step and what it touched glows until your next click. The key is forwarded to your configured provider, saved in this browser only if you tick remember, and never included in the board, autosave, or share links |
| Wire options | Select a wire — bus, label, arrowheads (→ or ↔), line style (solid, dashed, dotted, air gap), traffic flow, delete |
| Custom parts | **+ New** under My parts in the palette defines a part: name, category, accent, an icon (a built-in one, initials, or an SVG path), typed ports on any side, and extra fields. It is saved to My parts (this browser) and placed on the board. **Customize…** on any built-in card starts from its definition, so an MCU with a second CAN port keeps its wires. **Edit part…** on a custom card changes it and, when it came from a template, offers to update its siblings. Export and Import move My parts between machines as a JSON file. Custom parts in a board file travel with it; an older build of the app opens them as custom boxes |

Work is autosaved to the browser's localStorage and restored on reload.
Pending edits are flushed when the page is hidden or closed. Storage failures
are reported; save a board file for a portable copy.

## Connection geometry

Connections follow smooth curves with straight departures from card edges.
They try to take a clear path around nearby cards and notes. Parallel wires
keep their order and spread across the available edge space. Labels slide
along the curve to avoid cards and other labels; on short or crowded
connections, a small leader links the label to its wire.

Moving a part updates its connections and labels automatically. Routing leaves
your part positions intact. Fit and exports include the detours and labels,
and Layout quality checks inspect the paths you see. A crowded board can still
need manual spacing adjustments; remaining collisions appear in those checks.


## Locks and layout

A lock protects an item's position and existence. Its properties remain
editable and existing wires keep routing. Selecting it works as usual, but it
grows no drag or resize handles. The **Connect ports** dialog excludes locked
parts; unlock them before creating a connection through that dialog. Dragging a
zone carries its unlocked cards and passes over the locked ones. The lock is
saved in the file, in share links, and on a duplicate. Asking the assistant to
rearrange the board leaves locked cards, zones, and notes where they are and
lays the rest out clear of them; the assistant refuses to remove a locked item
and says so, and it can set or clear a lock when you ask it to.

The Align group appears once two or more items are selected; it works on cards,
notes, and zones, and a selected wire is ignored, since a wire follows the ports
it is drawn to. A selection of nothing but wires gets no group at all, rather
than a grid of buttons that could never come alive.
Every button reads each item's drawn size, so cards of different
widths finish with their real edges on one line. The line itself is the extreme
of the selection — the leftmost left edge for Align left, the midpoint of the
selection's bounds for the two centre buttons — except when exactly one item in
the selection is locked, in which case that item is the line, since it was
pinned deliberately. Two or more locked items name no single reference, so the
selection's extent decides again. Locked items never move; they only ever act as
the reference. Aligning a zone carries the unlocked cards and notes inside it,
exactly as dragging it does, unless such a card is itself in the selection, in
which case it takes its own alignment instead.

Distribute leaves an equal gap between facing edges rather than equal spacing
between centres: on cards of one size the two agree, but on cards of different
widths only the first reads as evenly spaced. The outermost two items hold
still and the rest move between them. Where the cards already overlap, they end
up overlapping by one even amount instead of an assortment. Where one card is
wide enough to span the whole run, no even gap fits it at all — the arithmetic
would put two cards on the same point, one of them invisible behind the other —
so Distribute spaces the left (or top) edges evenly instead. The outermost two
still hold still, the run still keeps the span the user set up, and wherever
the cards started at different edges, each keeps a place of its own. Distribute
and Tidy
spacing pass over locked items entirely: even spacing is a property of the whole
run, and it can only come out even if every participant is free to move.

Align needs two items that can move and Distribute needs three; below that the
buttons are disabled rather than doing nothing quietly. Each action is one undo
step. Results are never snapped to the grid, whatever the snap toggle says:
snapping each item on its own would undo the alignment it was just given, since
a centred card's left edge is its centre minus half its own width. Asking the
assistant to rearrange the board afterwards lays the cards out again from
scratch — alignment is an edit, not a constraint that persists.

## Copy and paste

Copy writes the selection to the system clipboard as one JSON payload, so a
paste lands in this board, in a board opened tomorrow, or in another tab.
What travels: the selected cards, notes, and zones, every wire with both of its
ends in the selection, and the definition of any custom part a copied card
uses, so the paste draws correctly where that part has never been seen. What
does not: a wire with one end outside the selection, because its other end
would have nothing to land on; the cards a selected zone happens to contain but
you did not select, exactly as with Duplicate; and the board's title, journey,
and view. A paste mints new ids, remaps the copied wires onto them, is one undo
step, and leaves precisely the pasted items selected. It lands 16px down and
right when the originals are still on this board, and at the coordinates it was
drawn at when the board has never held them, so a subsystem carried to another
board arrives where it was; either way it steps further while it would land
exactly on something, so pasting twice cascades instead of stacking out of
sight. A pasted custom card keeps its link to a My parts template only when
that template is the same part here — otherwise the card is drawn just as it
was copied but stops claiming to be a stamp of a template it never came from,
and nothing about a paste ever writes to My parts. The clipboard is untrusted
input: a payload is validated exactly as a saved file is, one paste is capped
at 500 items, and anything malformed produces a notice and leaves the board
untouched. Copy and paste inside a text field remain the browser's own, and so
do they whenever text is highlighted anywhere on the page — a passage of the
assistant's reply, a check finding, a line of the BOM: the highlighted text is
what those keys are for at that moment, and the board leaves them alone. Where a
browser denies clipboard access the copy still crosses boards within the tab.

## Shortcut reference

The `?` overlay lists every shortcut the app has, grouped as Tools, Selection,
View, Panels, and Editing. It reads from one table in the source, and the hint
strip along the bottom of the canvas is built from the rows of that table
marked short enough to show there. A test reads the table against the key
comparisons in every keydown handler, in both directions, so a key the overlay
advertises but nothing handles, or one a handler takes but the overlay never
mentions, fails the build.

## Explore and compare

Exploration is temporary view state: search, filters, and reading detail do not
change the board, create undo steps, or enter saved files and share links.
Exports retain full detail. **Export → Interactive HTML** creates one offline
file with search, bus filters, connection highlighting, pan/zoom, journeys, and
a board JSON download. It needs no server or external assets; journey links
use a `#step=` fragment within that same file. Connection highlighting follows the wires drawn
on the board in either direction; it does not simulate signal flow or prove
hardware compatibility. Opening another board clears the search and connection
filters. **Explore → Compare saved board** compares an earlier JSON file with
the current board by stable item IDs. Before/after previews and an expandable
field report separate additions, removals, configuration edits, rewiring, and
layout changes. Download comparison saves the change report as JSON.

## Layout checks

**Check → Layout quality** reports overlapping cards, labels obscured by cards,
wires crossing unrelated cards, and overlapping wire labels. Findings include
a selection action and a repair suggestion; available label repairs can be sent
to the assistant. Moving cards remains manual unless you explicitly ask the
assistant to rearrange the whole board. The assistant can request the same
measured findings using `run_checks` with `include_layout: true`. The display
is capped at 200 findings per check; curve checks use a half-pixel tolerance.

## Power estimates

**Check → Power budget** follows the drawn power wires and compares declared
loads with supply limits. **Check → Power** lists the same rail data without
judging it. Select a rail to highlight its parts.

Enter **Typical current** and **Peak current** for loads, **Output current limit**
for supplies, **Current rating** for fuses and **Capacity** for batteries. Units
such as `250mA`, `0.25 A` and `2 Ah` are accepted; bare current numbers mean mA.

Use **Engineering → Budget assumptions** for active/sleep currents, duty cycle,
converter voltage/efficiency and peak scenarios. A regulator's upstream draw
uses these declarations; without conversion assumptions, downstream current is
carried across without a voltage/efficiency conversion. Do not treat that default
as a converter design calculation.

Missing loads remain unknown. Known subtotals are shown, but battery runtime is
withheld if any downstream load is incomplete. Multiple supplies' declared limits
are an upper bound, not a model of load sharing. Runtime estimates do not model
ageing, cut-off voltage or thermal behavior. See [budget assumptions and worked
calculations](engineering-workflows.md#budget-assumptions).

## Appearance and export theme

The toolbar's **Appearance** icon cycles **Light → Dark → System → Light** on
each click. A sun, moon, or monitor shows the current mode; its tooltip names
the current and next modes. The choice is remembered on this device.
New devices default to System, which follows operating
system appearance changes while the editor is open. A saved Light or Dark choice
overrides the system setting. **Export theme** can override it for downloads; Automatic (SVG)
creates one SVG that follows the reader’s system appearance. Other formats
use the current appearance when Automatic is selected. **Copy PNG** copies at
the chosen dimensions and transparency, with PNG download available if the
browser denies image clipboard access. Offline HTML and recordings also
retain the chosen/current theme.

## Custom part storage

Custom parts carry their definition inside the board file, so share links and
saved files are self-contained. The library of templates lives in this
browser only; export it to a `.schematica-parts.json` file to move or share
it. Ports marked "req" in the editor are reported by Check when unwired.

## Assistant document privacy and limits

Assistant documents stay in memory for the current tab. Reloading, starting a
new thread, or replacing the board clears them. Selecting a file only extracts
text in your browser; it does not contact the model. On **Send**, the selected
extracted text goes to the AI endpoint you configured (and through the relay
when that provider requires it). Raw source payloads are not saved in the board,
autosave, share link, export, settings, or persisted assistant thread.
Ordinary messages and model replies can quote or discuss a source and keep their
existing history; removing a document stops its raw source text being resent.

Supported sources include Markdown, plain text and common text/code formats,
PDF, and Word `.docx`. Legacy binary `.doc` is not supported; export it as
`.docx`, PDF, or text. Scanned and image-only PDFs require OCR, which this
release does not provide. Password-protected PDFs must be exported unlocked.
Folders skip hidden paths, `.git`, `node_modules`, common credential files and
unsupported binary formats.

The limits are 20 documents, 10 MiB per file, 40 MiB across accepted files,
100,000 extracted characters per document, and the first 100 PDF pages. Each
request has a 60,000-character source-context budget shared fairly among the
selected documents. The source list marks extraction or request truncation as
partial and shows what will be included. PDF and DOCX extraction uses the
bundled, lazy-loaded PDF.js and Mammoth distributions; document bytes and
parsing stay local until selected extracted text is sent with your message.

## Journeys and recordings

Journeys are saved inside the `.schematica.json` document. Select parts or wires
and use **Link selection** on a step to make its camera follow those items.
**Go** and Present highlight the linked items and frame their current positions.
**Camera only** removes the link. Missing targets are reported, and a step with
no remaining targets falls back to its saved camera. Recording during
Present captures the animated tour with captions burned into the frames.

Use **Add selected parts as stops** to give a chapter an ordered sequence. Select
parts in the desired order, then edit stop captions or use the up/down buttons.
Without a linked selection, the chapter overview frames all its stops. Present
visits each chapter overview and its stops, with manual navigation or timed
playback at 0.5×, 1×, or 2× speed. Playback stops at the end and pauses when the
tab is hidden. Reduced-motion preferences disable camera tweening.

Between stops, Schematica highlights only directly connecting wires and names
the actual endpoint ports and buses. Multiple wires stay visible; saved arrows
retain their direction. An absent arrow is reported as unspecified, and a pair
without a direct wire is identified explicitly. Story order never invents
signal direction or a transitive route.

**Copy moment** creates a board share link with stable chapter and stop IDs.
Opening it restores that position with playback paused. HTML exports include
the same navigation, playback, connection explanations, and moment fragments.
When sharing an offline export, send the HTML file along with its fragment;
local file paths are not portable links. The copy dialog keeps a selectable
link available if the browser blocks clipboard access.

Try the **Guided story** examples: Weather Station (power, sensing, uplink),
EV Battery Management (monitoring, control, vehicle communication), and Secure
Boot Chain (trust, provisioning, rejected signatures, and recovery slots).
The authored stops and captions are available in English and Chinese.

## RDK architecture references

RDK presets distinguish X3, X3 Module, X5, S100 and S100P. X3 and X5 have
model-specific connector profiles (one and two CSI connectors respectively).
X3 Module and S100/S100P retain generic drawing ports until the carrier or
expansion assembly is verified. GS130W and GS130WI stereo modules require two
CSI connections; X3 and X3 Module are explicitly unsupported. Legacy camera
names and sensor families remain unverified when the exact vendor module,
revision or adapter is unknown.

Select an RDK part to see source links, the reference check date, camera
occupancy and findings. Changing profiles preserves saved wires and marks
unavailable endpoints; new connections cannot use them. Undo restores the
previous profile. Check also reports incompatible or unverified camera paths,
CSI overuse, board input-voltage mismatches and software target/runtime issues.
Camera-path findings need at least one catalogue part: a board and camera that
are both outside it raise no RDK finding. Input-voltage checks read the rail of
any supply that only outputs power (battery, jack, solar, vehicle battery); a
regulator's rail may describe its input, so its output is never inferred.

The rover and stereo perception starters connect GS130W to both X5 CSI ports.
Their `hobot_sensor`, `hobot_dnn`, `hobot_codec` and `hobot_render` blocks target
the X5 and describe intended processing with logical flow arrows. They do not
install, launch or validate software. Runtime is deliberately left unselected:
broad package support does not establish an exact runtime compatibility matrix.
General checks retain explicitly documented incomplete power/return wiring.
No starter is marked as hardware-tested.

The X3 vision robot starter takes the single X3 CSI connector for one IMX219
module and routes motion over UART to a drive MCU, because the X3 profile has
no CAN FD; the camera stays an open compatibility finding. The S100 perception
node starter feeds the board from a 4S pack inside its documented 12-20V input
window and pairs a GS130WI through the camera expansion board; the S100 keeps
generic drawing ports, so its connectors, stereo pair and camera fit stay
warnings by design.

The assistant's read-only `rdk_reference` tool retrieves the same source-linked
facts. **Download setup guide** in the board properties exports Markdown with
the BOM, drawn connections, software targets, assumptions, RDK findings and
references. It is an architecture reference, not an executable deployment plan.

Catalogue evidence was checked on **2026-09-06**. References identify archived
hardware/accessory guides separately from maintained product and software
pages. Exact revisions, cable orientation, adapters, power sizing and package
setup still need verification against those sources and the physical hardware;
a clean RDK check does not certify operation.
