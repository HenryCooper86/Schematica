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

Work is autosaved to the browser's localStorage and restored on reload.

## Develop

Pure logic (state, geometry, palette data, serialization) is dependency-free
and tested with Node's built-in runner:

```bash
npm test   # node --test
```

Layout: `src/state.js` owns the document model + undo; `src/render.js` draws
it into layered SVG; `src/tools.js` is the pointer/keyboard state machine;
`src/serialize.js` validates files; `src/export.js` builds standalone
SVG/PNG. See `docs/superpowers/specs/` for the design spec.
