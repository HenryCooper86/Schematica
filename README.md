# Schematica

A canvas board for drawing embedded-system and hardware architecture
diagrams in the browser. Drag MCUs, sensors, actuators, power and radio
modules onto the canvas and wire them together with typed buses (I2C, SPI,
UART, CAN, USB, power rails, ...). Inspired by
[net_draw](https://mr-r3b00t.github.io/net_draw/), specialized for embedded
hardware.

The UI is a dark, netdraw-inspired design: tinted icon badges, typed bus colors, and label chips on wires and zones.

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
| Zone | `Z`, drag a rectangle (select it by its border or title) |
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
| Examples | Examples menu — load a built-in board (Weather Station, Drone FC, CAN Bus), journey included |

Work is autosaved to the browser's localStorage and restored on reload.

Journeys are saved inside the `.schematica.json` document. Recording during
Present captures the animated tour with captions burned into the frames.

## Develop

Pure logic (state, geometry, palette data, serialization) is dependency-free
and tested with Node's built-in runner:

```bash
npm test   # node --test
```

Layout: `src/state.js` owns the document model + undo; `src/render.js` draws
it into layered SVG; `src/tools.js` is the pointer/keyboard state machine;
`src/serialize.js` validates files; `src/export.js` builds standalone
SVG/PNG. `src/gif.js` is a zero-dependency GIF89a encoder; `src/journey.js`
holds journey steps and camera tween math; `src/recorder.js` drives frame
capture and MediaRecorder. See `docs/superpowers/specs/` for the design spec.
