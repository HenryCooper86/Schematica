# Presentation stories

Completed in five phases, each committed and pushed separately:

1. Chapter rail, play/pause, speed, restart, show all; bounded and cancellable playback.
2. Ordered part stops, stop captions, reordering and undo; legacy journeys remain valid.
3. Exact direct-wire focus with endpoint ports, bus labels and authored arrow direction.
4. Self-contained HTML playback and stable chapter/stop moment links.
5. English/Chinese examples, regression checks and deployment verification.

## Authoring and playback

Each existing journey step is a chapter. Optional `stops` contains up to 100
`{ id, node, caption }` records; IDs are stable within a chapter. Stops may revisit
a part, and their order is authored rather than inferred from wiring. Add the
selected parts, edit captions, and reorder or remove stops through the Journey
panel. These edits participate in the existing undo stack.

A chapter's linked targets define its overview when present; otherwise its stops
define the overview. A legacy chapter uses its saved camera. A missing stop stays
in the story, shows a missing-part message, and uses the saved camera. Links to a
removed stop open its surviving chapter overview. A missing chapter does not open
a presentation.

Playback includes every chapter overview and stop, then ends. Manual navigation
pauses playback; changing speed replaces the pending tick. Hidden tabs pause,
reduced motion jumps the camera, and document replacement exits the presentation.
Editing a story pauses playback and preserves the active chapter/stop by ID when
it survives. Show all clears presentation highlights and recorded captions.

## Connection meaning

Only wires directly joining consecutive stops are highlighted. Multiple wires
are all retained and described. Saved arrows are displayed in their actual
orientation; no arrow means direction unspecified. The presentation does not
infer electrical direction from `from`/`to`, imply a transitive path, or simulate
hardware behavior. The current part gets a stronger outline; the connecting
ports are exposed in the editor and named in both viewers.

## Sharing and exports

Editor moment links embed the board using the existing compressed share format,
plus `step`, optional `stop`, and `present` fragment parameters. Opening a shared
board retains the existing previous-board backup behavior. Moment links open
paused. Standalone HTML includes its own data, SVG and runtime, with no network
requests or module imports. For local files, Copy moment provides a fragment to
send with the HTML file; for hosted exports, it provides a full URL.

Both copy dialogs keep the link selectable when clipboard access is unavailable.
Presentation state stays out of canonical SVG/PNG exports and saved board data;
recordings continue to capture the presented camera, highlights and captions.

## Examples and verification

Weather Station covers power, radio communication, and sensor acquisition. EV
Battery Management covers pack connections, monitoring, control, and CAN
communication. Secure Boot includes the successful chain, roots, provisioning,
threat inspection, rejected bootloader, and recovery-slot chapters. All authored
stop captions have Chinese translations.

Run `npm test`, `npm run e2e`, and `PRESENTATION_E2E_ONLY=1 npm run e2e`.
CI runs both browser suites. The focused suite covers legacy navigation, editing,
timed advancement, exact connections, shared-board restoration and offline HTML
playback/sharing. GitHub Pages publishes the repository root from `main`.
