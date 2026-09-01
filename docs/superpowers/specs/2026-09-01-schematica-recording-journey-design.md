# Schematica — Recording & Journey Design Spec (v1.1 increment)

**Date:** 2026-09-01
**Status:** Approved by user (design review in chat)
**Builds on:** `2026-09-01-schematica-design.md` (v1, merged at e2e3430)

## What

Two features deferred from v1, modeled on net_draw:

1. **Rec** — record the live canvas (pans, zooms, selections, wire drawing —
   everything the user sees) to WebM/MP4 video with optional audio, or to an
   animated GIF. Zero dependencies.
2. **Journey** — an authored step-through presentation: each step is a saved
   camera view plus a caption; Present mode animates between steps with
   pagination controls. Journeys are part of the document.

The two compose: recording during Present captures the animated tour with
captions rendered into the frames.

## Architecture

New modules, existing conventions (vanilla ES modules, no build step, no
runtime dependencies; pure modules stay DOM-free and node:test-able):

```
src/recorder.js   — frame pump (SVG → bitmap → canvas), MediaRecorder,
                    audio wiring, GIF frame capture, elapsed/encoding state.
                    DOM-bound; not unit-tested.
src/gif.js        — pure GIF89a encoder: encodeGIF(frames, opts) → Uint8Array.
                    frames: [{ data: Uint8ClampedArray (RGBA), width, height }].
                    Median-cut quantizer + LZW. Unit-tested.
src/journey.js    — pure: step CRUD action helpers (store-based) +
                    easeInOutCubic + tweenView(from, to, t). Unit-tested.
```

UI wiring in `main.js` / `index.html` / `css/style.css`. `serialize.js`
validates the new field. `state.js`, `render.js`, `geometry.js`, `export.js`,
`tools.js` are unchanged except: `tools.js` exposes nothing new (present-mode
key handling lives in main.js's presentation controller and runs before the
canvas keydown logic via capture-phase listener).

### Frame capture (recording core)

Per animation frame: `new XMLSerializer().serializeToString(svg)` of the live
`#canvas` (with injected explicit `width`/`height` attributes and a background
rect in `CANVAS_BG`), → `Blob` → `createImageBitmap` → `drawImage` onto an
offscreen `<canvas>` sized to the SVG's client size × `min(devicePixelRatio, 2)`.
Decodes are pipelined (skip a tick if the previous decode is in flight).
Video: `offscreen.captureStream(30)` → `MediaRecorder`. GIF: at a fixed 10fps,
`getImageData` frames downscaled to ≤ 960px wide are buffered for encoding.

## Data model

```json
"journey": [
  { "id": "j…", "label": "Step 1", "view": { "x": 40, "y": 40, "zoom": 1 },
    "caption": "Power enters through the charger…" }
]
```

- Optional document field; `schema` stays `1`. Missing → `[]` on load (old
  files unaffected; old app versions drop it on re-save — accepted best-effort
  forward compatibility).
- Validation on load: `id` valid unique string, `view.x`/`view.y` finite,
  `view.zoom` finite and clamped to [0.2, 4], `label`/`caption` strings
  (defaults `"Step"` / `""`). Invalid steps dropped with a warning.
- All journey edits go through `store.apply` → undoable, autosaved,
  round-tripped through save/open.

## Recording UX

- **Rec** button (red dot) in the toolbar right group opens `#rec-dialog`,
  a dark modal styled like net_draw's:
  - FORMAT radios: WebM — VP9, WebM — VP8, MP4 — H.264, MP4 — AV1 — each
    shown only if `MediaRecorder.isTypeSupported` confirms it — plus
    **GIF (animated)**, always available. First supported option preselected.
  - AUDIO radios: No audio / Microphone narration / Music file (file input).
    The audio section is disabled when GIF is selected.
  - Buttons: **Start recording** / **Cancel**.
- While recording, the Rec button becomes a stop control showing elapsed time
  (`● 0:23`); clicking stops, finalizes, and downloads
  `<safe-title>.webm|.mp4|.gif` via the existing `download()`.
- Audio wiring: mic via `getUserMedia({ audio: true })` (denied → readable
  alert, dialog stays open); music via `AudioContext.decodeAudioData` →
  `MediaStreamAudioDestinationNode`, started at record start, stopped at end.
- GIF: 10fps, auto-stop at 60s (600 frames) with a notice; on stop the button
  shows **Encoding…** until `encodeGIF` finishes (it runs sync; frames are
  few). Memory guard: frames stored as `ImageData` at ≤ 960px wide.
- No supported video format at all → dialog shows GIF only.
- Recording state must not interfere with editing; Escape keeps its canvas
  meaning and does not stop recording.

## GIF encoder (`src/gif.js`)

- `encodeGIF(frames, { delayMs = 100, loop = true }) → Uint8Array`.
- Global 256-color palette via median cut over pixels sampled from the first,
  middle, and last frames; nearest-palette mapping, no dithering.
- GIF89a: header, logical screen descriptor, global color table, NETSCAPE2.0
  loop extension, per-frame graphics-control extension (delay) + image
  descriptor + LZW-compressed indices, trailer `0x3B`.
- Pure function; throws on empty input or mismatched frame sizes.

## Journey UX

- **Journey** toolbar button (next to Legend) toggles `#journey-panel`, a
  right-side panel occupying the props slot (props panel hidden while open;
  reopens on selection after the journey panel closes).
- Panel contents: ordered step list — each row: editable label, caption
  textarea, **Go** (jump camera instantly), **Set** (update the step's view to
  the current camera), ↑ / ↓ reorder, ✕ delete — plus
  **＋ Add step from current view** and **▶ Present** (disabled with 0 steps).
- **Present mode:** adds a `presenting` class on `#app` that hides toolbar,
  palette, panels, and hint bar; shows a bottom-center overlay: caption card,
  `‹ N / M ›` pagination, ✕ exit. `ArrowLeft`/`ArrowRight` navigate, `Escape`
  exits (capture-phase listener so the canvas Escape handler never sees it).
  Entering goes to step 1; the camera tweens to each step's view with
  easeInOutCubic over 600 ms (rAF; interrupting navigation retargets the
  tween from the current camera).
- Canvas editing stays live during Present (harmless; no special lockout).

## Recording × Present composition

The presentation controller calls `recorder.setOverlay(caption, counterText)`
(cleared on exit). When overlay text is set, the recorder draws a caption
card + counter onto each composed canvas frame (rounded dark card, wrapped
caption text via `wrapText`, mono counter) — so recorded tours include
captions even though the live overlay is HTML.

## Error handling

- Serializer/bitmap failures during recording: skip the frame; three
  consecutive failures abort the recording with an alert and no download.
- `MediaRecorder.onerror` → abort with readable alert.
- Journey `Go`/Present with a step whose view was authored on another screen
  size still works (view is world-space pan/zoom; no dependency on viewport).

## Testing

- **Unit (node:test, zero deps):**
  - `gif.js`: GIF89a structure (signature, screen descriptor dimensions,
    NETSCAPE block, frame count, trailer); quantizer (≤256 colors, exact
    mapping when input ≤256 distinct colors); a tiny known-vector encode; the
    empty-input/mismatched-size throws.
  - `journey.js`: addStep/updateStep/removeStep/moveStep through a real
    Store (undo restores), easing endpoints (0→0, 1→1, monotonic),
    tweenView interpolation endpoints and midpoint.
  - `serialize.js`: journey round trip; invalid steps dropped with warnings;
    zoom clamping; missing journey → [].
- **Manual in-browser:** record WebM of a live editing session; record a GIF
  and open it; journey authoring (add/reorder/caption/Set/Go), Present
  navigation + tweens + exit; Rec during Present shows captions in the file;
  mic/music paths (mic requires human permission grant).

## Success criteria

Author a 3-step journey on the demo board, press Present, record the tour as
WebM and as GIF; both files download and play showing the animated camera and
captions; save/reload preserves the journey; all existing behavior unchanged;
zero console errors.
