# Schematica

A canvas board for drawing embedded-system and hardware architecture
diagrams in the browser. Drag MCUs, sensors, actuators, power and radio
modules onto the canvas and wire them together with typed buses (I2C, SPI,
UART, CAN, USB, power rails, ...). Inspired by
[net_draw](https://mr-r3b00t.github.io/net_draw/), specialized for embedded
hardware.

The UI mirrors net_draw's dark design: shaded cards with tinted icon badges, slate wires that leave each card toward the other, and a label pill on every wire naming its bus. Cards size themselves to their content: the part number, interface address, and voltage rail appear as mono lines under the name.

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
| Select / move | `V`, click or drag; marquee on empty canvas; shift-click adds |
| Zone | `Z`, drag a rectangle (select it by its border or title); drag a corner handle to resize; dragging a zone carries the cards inside it |
| Find a part | Type in the palette search — names, categories, buses, or vendors (RDK, Journey) |
| Nudge | Arrow keys move the selection 1px; `Shift` + arrow moves a grid step |
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
| Examples | Examples menu — ten built-in boards from sensor nodes to edge-to-cloud, including a D-Robotics RDK X5 rover and a Horizon Journey 6 ADAS stack, journeys included |
| Presets | Part number field — on AI SBCs, automotive SoCs, ADAS controllers, cameras, depth cameras, LiDARs, and serial servos, pick a vendor part (D-Robotics RDK boards and camera modules, Horizon Journey chips and Mono / SuperDrive tiers, and more) to fill the rail and a spec note |
| Animate | Animate toggle — traffic dashes flow along wires and Bug/Thermal alerts pulse (net_draw style); off by default, and a wire's own "Always" flow setting keeps just that wire moving; captured in recordings |
| Pan | `H` or hold Space — dedicated hand tool |
| Fullscreen | ⛶ button in the zoom group |
| Export dialog | PNG opens a size dialog — pixel dimensions, aspect lock, transparent background; the dialog's SVG button honors the transparency option (the toolbar SVG button is an instant opaque export) |
| BOM | BOM button — bill of materials grouped by part number (qty, refs, addresses, rails, status, flags); CSV download or Markdown copy |
| Share | Share button — the whole board compressed into a copyable URL; opening the link loads it, no backend |
| Check | Check button — design rule checks: I2C address conflicts, unconnected power pins, floating parts, bus mismatches, lifecycle risks |
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
capture and MediaRecorder. See `docs/superpowers/specs/` for the design spec.
