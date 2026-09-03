# Schematica

A canvas board for drawing embedded-system and hardware architecture
diagrams in the browser. Drag MCUs, sensors, actuators, power and radio
modules onto the canvas and wire them together with typed buses (I2C, SPI,
UART, CAN, USB, power rails, ...). Built for embedded and vehicle systems:
typed ports and buses, design-rule checks, a bill of materials, vendor
presets, and example boards from a weather station to an ADAS security
review.

The UI is a dark, high-contrast canvas: shaded cards with tinted icon badges, slate wires that leave each card toward the other, and a label pill on every wire naming its bus. Cards size themselves to their content: the part number, interface address, and voltage rail appear as mono lines under the name. Beyond hardware, the palette carries Network, Security & Edge, Process Flow (real flowchart shapes), and Threats parts, from threat actors, malware, and C2 servers to vulnerabilities, misconfigurations, exploits, supply-chain compromise, DDoS, on-path attackers, sensor spoofing, stolen credentials, data exfiltration, and physical tampering, so a board can put a firewall, a decision diamond, and a threat actor next to an MCU.

No build step, no dependencies, no server: static HTML + ES modules + SVG.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. To publish on GitHub Pages: push this repo,
then Settings → Pages → deploy from branch `main`, root folder.

## Use it

| Action | How |
|--------|-----|
| Add a part | Drag it from the palette, or click it |
| Wire two parts | Drag from a port to another port (any tool) |
| Pick the bus type | Automatic when both ports agree; popover otherwise |
| Re-attach a wire | Select it, then drag either end handle onto another port (the bus follows the new ports, or asks) |
| Select / move | `V`, click or drag; marquee on empty canvas; shift-click adds |
| Zone | `Z`, drag a rectangle (select it by its border or title); drag a corner handle to resize; dragging a zone carries the cards inside it |
| Find a part | Type in the palette search — names, categories, buses, or vendors (RDK, Journey) |
| Nudge | Arrow keys move the selection 1px; `Shift` + arrow moves a grid step |
| Fold a panel | The ▾ in the properties or journey panel header folds it to a bar; remembered across reloads |
| Hide the panels | `P` or the panels button hides the properties and journey panels entirely; press again (or open Journey) to bring them back; remembered across reloads |
| Hide the palette | `B` or the palette button hides the parts palette so the canvas takes the full width; press again to bring it back; remembered across reloads |
| Sticky note | `N`, click |
| Rename anything | Double-click its text, or use the properties panel |
| Pan / zoom | Space-drag or middle-drag; scroll wheel |
| Undo / redo | `Ctrl/Cmd-Z`, `Ctrl/Cmd-Shift-Z` |
| Duplicate | `Ctrl/Cmd-D` |
| Delete | `Delete` / `Backspace` |
| Save / open | Toolbar — downloads/reads `*.schematica.json` |
| Export | Toolbar — SVG or 2x PNG, cropped to content |
| Record | Rec button — WebM/MP4 video (optional mic or music audio) or animated GIF |
| Journey | Journey button — save camera steps with captions; Present plays the tour (arrow keys, Esc) |
| Examples | Examples menu — thirteen built-in boards from sensor nodes to edge-to-cloud, including a D-Robotics RDK X5 rover, a Horizon Journey 6 ADAS stack, a sensor node that passes every design rule, and vehicle OTA and ADAS security boards that mix threat actors, controls, and response flowcharts with the hardware, journeys included |
| Presets | Part number field — on AI SBCs, automotive SoCs, ADAS controllers, cameras, depth cameras, LiDARs, and serial servos, pick a vendor part (D-Robotics RDK boards and camera modules, Horizon Journey chips and Mono / SuperDrive tiers, and more) to fill the rail and a spec note |
| Threat details | Threat parts carry their own fields instead of the part-number trio: STIX vocabularies (actor type, sophistication, motivation, malware type), references (CVE, CVSS, ATT&CK technique), and a severity from info to critical that shows as a colored tag. Every part can also carry a disposition (friendly, partner, neutral, unknown, suspicious, adversary, victim), shown as a tag beside the lifecycle status |
| Animate | Animate toggle — traffic dashes flow along wires and Bug/Thermal alerts pulse; off by default, and a wire's own "Always" flow setting keeps just that wire moving; captured in recordings |
| Pan | `H` or hold Space — dedicated hand tool |
| Fullscreen | ⛶ button in the zoom group |
| Export dialog | PNG opens a size dialog — pixel dimensions, aspect lock, transparent background; the dialog's SVG button honors the transparency option (the toolbar SVG button is an instant opaque export) |
| BOM | BOM button — bill of materials grouped by part number (qty, refs, addresses, rails, status, flags); CSV download or Markdown copy |
| Share | Share button — the whole board compressed into a copyable URL; opening the link loads it, no backend |
| Check | Check button — design rule checks: I2C address conflicts, unconnected power pins, floating parts, bus mismatches, lifecycle risks (the Sensor Node example passes them all) |
| PDF | Export dialog — single-page PDF of the board (alongside PNG/SVG) |
| Wire options | Select a wire — bus, label, arrowheads (→ or ↔), line style (solid, dashed, dotted, air gap), traffic flow, delete |

Work is autosaved to the browser's localStorage and restored on reload.

Journeys are saved inside the `.schematica.json` document. Recording during
Present captures the animated tour with captions burned into the frames.

## Develop

Pure logic (state, geometry, palette data, serialization) is dependency-free
and tested with Node's built-in runner:

```bash
npm test      # node --test: unit tests, no dependencies
npm run e2e   # headless Chrome smoke test over the DevTools Protocol (set CHROME_PATH if needed)
```

Both run in GitHub Actions on every push and pull request (`.github/workflows/ci.yml`).

Layout: `src/state.js` owns the document model + undo; `src/render.js` draws
it into layered SVG; `src/tools.js` is the pointer/keyboard state machine;
`src/serialize.js` validates files; `src/export.js` builds standalone
SVG/PNG. `src/gif.js` is a zero-dependency GIF89a encoder; `src/journey.js`
holds journey steps and camera tween math; `src/recorder.js` drives frame
capture and MediaRecorder. `src/main.js` only boots the app; the panels,
dialogs, and menus live in `src/ui/` (properties panel, palette, legend,
export/BOM/DRC dialogs, journey and present mode, examples menu, recording).
See `docs/superpowers/specs/` for the design spec.

## Acknowledgements

Schematica started as a hardware-focused take on the ideas in
[net_draw](https://mr-r3b00t.github.io/net_draw/) and has since grown its own
model: typed ports and buses, design rules, the bill of materials, vendor
presets, and content-sized cards. The icon glyphs of the Network, Security &
Edge, Process Flow, and Threats parts are adapted from net_draw's icon set.
