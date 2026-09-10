# Schematica AI Copilot — Design Spec

**Date:** 2026-09-05
**Status:** Approved in chat, section by section, on 2026-09-05
**Supersedes:** `2026-09-02-ai-design-assistant-design.md` and the four
`2026-09-02-ai-*` implementation plans. That spec made the assistant a
reviewer behind a hosted backend; this one makes it a co-designer that builds
and edits boards, and keeps Schematica a static site.

## Summary

Schematica gains an assistant that **builds and edits boards** from natural
language. The user describes a system and gets a complete board; asks for a
change and gets it applied; asks for the design-rule findings to be fixed and
they are; asks for details and blank part numbers, addresses, and rails are
filled from the palette's presets. Review and explanation happen along the way
but are not the product.

The assistant runs **entirely in the browser with the user's own API key**.
There is no backend, no account, and no new dependency: the Anthropic API,
OpenAI-compatible endpoints, and local Ollama are called over plain `fetch`.
Schematica stays a static site with no build step.

The model never touches the document directly and never places anything. It
calls a small set of tools, the only mutating one takes a batch of allowlisted
operations that is validated in full before it is applied, and a deterministic
layout engine in the app positions whatever is new. Everything the assistant
does in reply to one message is a single undo step, and the items it touched
are highlighted on the canvas.

## Goals

- Build a complete board from a one-paragraph brief on an empty canvas.
- Edit the current board by instruction: add, replace, remove, rewire, rename,
  annotate, group into zones.
- Fix what the design-rule check reports, from the assistant or from a button
  on each finding.
- Fill in part numbers, addresses, rails, and notes from the vendor presets.
- Keep the user in control: one undo step per reply, touched items highlighted,
  a hand layout that survives edits, a Stop button, and a key that never leaves
  the browser except to the provider the user chose.
- Work with Claude by default and with OpenAI-compatible and Ollama models,
  degrading to a single-shot mode when a model cannot call tools.
- Ship with unit tests and browser checks that run in CI without a key.

## Non-goals (this release)

- Image input (whiteboard photos, screenshots).
- A dedicated explain or review mode; the model answers questions naturally.
- Creating swimlanes; the assistant creates plain zones only.
- Any backend, account, sync, or shared history across devices.
- Per-change accept and reject; the unit of reversal is the reply.
- An MCP server. The tool layer is shaped so one can wrap it later.
- Cost guarantees; the cost line is an estimate from a built-in price table.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where model calls run | Browser, bring your own key | Keeps the static, no-server product; ships fastest; all the pieces are also the foundation for a backend later |
| Default model | Claude Opus 5 (`claude-opus-5`), adaptive thinking, effort `medium` by default | Strongest tool-use quality; effort is user-adjustable |
| SDK | None; plain `fetch` adapters | No build step and no dependencies is a product promise; the other two providers are raw HTTP anyway |
| How the model edits | Tool-using loop with one mutating tool that takes an operation batch | Self-correcting (build, check, fix), validated per batch, uniform for build and edit; single-shot fallback for models without tools |
| Placement | App-side deterministic layout; the model emits no coordinates | Models place boxes badly; every serious 2026 tool moved layout out of the model |
| Reversal | One undo step per reply plus highlight of touched ids | Matches the fast co-designer loop; undo already exists and is trusted |

## Architecture

```
src/ai/
  ops.js          operation schema, validation, application (pure)
  layout.js       full and incremental placement (pure geometry)
  context.js      board text and catalogue text for the model (pure)
  tools.js        tool definitions + executors over { getDoc, commit } (pure)
  agent.js        the request loop: prompt, provider call, tool execution, batch, highlight
  settings.js     provider settings and key storage
  providers/
    stream.js     SSE and NDJSON line parsers (pure)
    anthropic.js  Messages API adapter
    openai.js     chat-completions adapter (OpenAI-compatible)
    ollama.js     Ollama chat adapter
src/ui/assistant-ui.js   the floating panel
```

Existing files that change:

- `src/state.js`: the drag snapshot becomes a general batch (`beginBatch`,
  `endBatch`, `cancelBatch`, `inBatch`); `beginDrag`, `endDrag`, `cancelDrag`,
  and `isDragging` remain as thin aliases so `tools.js` and `main.js` do not
  churn.
- `src/render.js`: the overlay renders `ui.highlight` (a set of ids) as a
  pulsing ring around nodes, zones, and notes and a glow along wires.
- `src/tools.js`: the `A` shortcut toggles the panel; any pointerdown on the
  canvas clears the highlight.
- `src/ui/dialogs.js`: each design-rule finding gets a Fix button.
- `src/main.js`: boots the panel; clears the assistant thread when the board is
  replaced.
- `index.html`, `css/style.css`, `README.md`.

The pure modules import nothing from the DOM and are tested with `node --test`
like the rest of the codebase. The executors in `tools.js` take a two-method
interface, `getDoc()` and `commit(fn)`, so the browser passes the store and
tests pass a plain document; a future MCP server would pass a document too.

## The edit operation contract

The model changes the board only through `apply_edits`, whose input is a
batch of operations. A batch is atomic: every operation is validated against
the palette, the bus table, and the current document before any is applied;
if one fails, nothing is applied and the tool result lists every error with
the index of the offending operation and what would have been valid.

### References

Operations that create items carry a `ref`, a short label the model chooses
(`mcu1`, `zonePower`). Later operations in the same batch use it wherever an
id is expected. Existing items are addressed by id. The tool result maps every
ref to the id that was created. A ref that collides with an existing id or is
used before it is defined is an error.

### Operations

| Operation | Fields | Notes |
|---|---|---|
| `add_part` | `ref`, `kind`, `label?`, `sublabel?`, `addr?`, `rail?`, `notes?`, `status?`, `flags?`, `fields?`, `disposition?`, `near?`, `in?` | `kind` must be a palette kind. `near` is an existing node id or ref used as a layout anchor; `in` is a zone id or ref. Text fields obey `MAX_TEXT`. `status`, `flags`, `disposition`, and the keys of `fields` are validated exactly as `deserialize` validates them |
| `update_part` | `id`, any of the fields above except `kind` | Unknown fields are an error |
| `replace_part` | `id`, `kind` | Keeps the position and every field the new kind supports: label, part number, address, rail, notes, status, flags, disposition, and the schema fields the new kind declares; other schema fields are dropped with a warning. Every wire on the node is re-attached to a port of the same bus on the new kind (first unwired, or any for shared buses); wires with no such port are removed and listed in the result as warnings |
| `remove` | `ids` | Nodes, wires, zones, notes; removing a node removes its wires, removing a zone leaves its members. Unknown ids are an error |
| `connect` | `ref?`, `from`, `to`, `bus?`, `label?`, `arrow?`, `style?` | `from` and `to` are `{ node, port? }`. See port picking below. `arrow` is `fwd`, `both`, or null; `style` is `solid`, `dashed`, `dotted`, or `sneakernet` |
| `update_wire` | `id`, `bus?`, `label?`, `arrow?`, `style?`, `flow?` | |
| `add_zone` | `ref`, `label`, `color?`, `members` | `members` is a non-empty list of node ids or refs; the rectangle comes from layout. Plain zones only |
| `update_zone` | `id`, `label?`, `color?`, `members?` | Setting `members` re-fits the rectangle around the new set without moving nodes |
| `add_note` | `ref`, `text`, `near?` | |
| `update_note` | `id`, `text` | |
| `set_title` | `title` | |

There is no move, no resize, and no coordinate anywhere in the contract.
"Tidy this up" is the `arrange` tool, not an operation.

### Port picking

`connect` may name ports or leave them out.

- **Bus given, ports omitted.** On each node the engine picks a port of that
  bus. On a shared bus (`power`, `gnd`, `i2c`, `can`, `canfd`, `rs485`) a port
  may carry many wires, so the first port of that bus is used. On every other
  bus the first port of that bus with no wire is used; if none is free the
  operation fails, naming the ports that exist.
- **Ports given.** Both must exist on their parts. If they carry the same bus
  the wire takes it. If they differ, the operation must name the bus; the wire
  is created and the result carries a warning, exactly as the popover lets a
  user do.
- **Untyped buses.** `flow` and `link` connect anything: if the requested bus
  is `flow` or `link` and a node has no port of that bus, a side port is used.
  These ports carry any number of wires.
- **Nothing given.** Power and ground are set aside, since almost every pair
  of parts shares them. If exactly one other bus is common to both parts it
  is used; otherwise the operation fails and lists the buses each part offers.

### Limits

At most 200 operations per batch. Text fields are cut to `MAX_TEXT` with a
warning, as in `deserialize`.

## Tools

| Tool | Input | Result |
|---|---|---|
| `search_parts` | `query` | Up to 20 kinds matching `filterParts`, one line each: kind, name, category, ports as `id(bus)` |
| `get_board` | none | The board text below |
| `run_checks` | none | Findings from `checkDoc`: level, rule, message, ids |
| `list_presets` | `kind` | Each preset's name, part number, rail, and note |
| `apply_edits` | `ops` | On success: count applied, the ref-to-id map, one line per change, warnings. On failure: the error list; nothing applied |
| `arrange` | `ids?` | Re-runs full layout on the given nodes (all nodes if omitted) and re-fits zones; returns ok |

Tool inputs use strict JSON schemas (`additionalProperties: false`, every
field listed in `required` or optional by schema). Tool results are plain
text, short, and always carry ids so the model can refer to what it did.

## What the model sees

### System prompt

Two blocks. The first is stable across every request and is marked for prompt
caching on the Anthropic adapter:

1. **Role and rules.** The assistant builds and edits Schematica boards. Use
   only kinds from the catalogue. Never invent ports; connect by bus and let
   the engine pick ports. After building or making several changes, run the
   checks and fix what they report. Prefer presets for part numbers. Conventions:
   power on the left, compute in the middle, peripherals on the right; group
   subsystems into zones; put assumptions in notes; use status and flags as
   the palette defines them; threat parts carry disposition and severity.
   Reply briefly: what changed, what was assumed, what is open.
2. **Catalogue.** Every kind on one line: `kind  name  (category)  ports:
   id(bus), …  fields: id, …`. Then buses: `id  name  shared|point-to-point|
   untyped`. Then presets per kind by name. About five thousand tokens.

The second block is per request and not cached: the date, the effort hint,
and the single-shot instructions when the provider has no tool calling.

### Board text

Appended to every user message so an edit needs no round trip to see the
board. One line per item, human-readable, ids first:

```
board "Weather Station"
zone z1 "Power" members: n1 n2 n3 n4
node n5 mcu "MCU" pn="ESP32-S3" rail=3.3V status=production notes="Deep sleep between readings"
node n6 temp "Temp sensor" pn="BME280" addr=0x76 rail=3.3V status=production
node n7 threatactor "APT group" disposition=adversary severity=high actorType=nation-state
wire w6 i2c n5.i2c -- n6.i2c
wire w4 power n4.out -> n5.vcc "3V3"
note t1 "All logic runs on the 3.3V rail"
selected: n5 w6
checks: error i2c-conflict "I2C address 0x76 used twice" n6 n9
```

Rules: `pn` is the sublabel; empty fields are omitted; `->` marks a forward
arrow, `<->` both, `--` none; a wire with style or flow set shows `style=`
and `flow=`; schema fields appear by id; the `selected:` line appears only
when the selection is non-empty; `checks:` lists current findings or is
omitted when there are none. Strings are quoted with `"` and inner quotes
escaped. The same renderer produces the `get_board` result.

### Quick actions

- **Build from a brief** prefills the input with a template the user completes:
  "Build a board for: …  Must have: …  Power: …  Connectivity: …".
- **Fix checks** sends "Fix these findings:" followed by the findings.
- **Fill in details** sends "Fill in blank part numbers, addresses, rails, and
  notes from the presets. Change nothing else."
- **Fix (in the design-rule dialog)** closes the dialog, opens the panel, and
  sends "Fix this finding:" with the finding and its ids.

## Layout

One engine, two modes. Same input always gives the same output; ties break on
id. All coordinates snap to the 8 px grid. Card sizes come from `nodeSize`.

### Full layout

Used when the board has no placed nodes, and by `arrange`.

1. Build the undirected graph of nodes joined by wires.
2. Pick the hub: the compute-category node with the most wires, else the node
   with the most wires, else the first node by id.
3. Breadth-first distance from the hub. Column index is the distance, negated
   for power-category nodes so they sit to the left; the hub is column 0.
   Nodes not reachable from the hub go one column past the rightmost, or the
   leftmost if they are power parts.
4. Row order within a column, sweeping outward from column 0: sort by the mean
   row of a node's neighbours in the column one step nearer the hub, keeping
   members of the same zone contiguous (zone group key first, then the mean).
   Ties by category order, then label, then id.
5. Coordinates: a column's width is its widest card plus a 96 px gap; row
   pitch is the card height plus 40 px; each column is centred on the hub's
   vertical centre.
6. Zones: the bounding box of the members plus 28 px padding and the title
   strip. Zones that overlap after placement are pushed apart vertically in
   id order.
7. Notes: 16 px above the node named by `near`, centred; otherwise stacked in
   the top-left corner of the content bounds.

### Incremental placement

Used when some nodes already have positions, which is every edit. Placed
nodes, zones, and notes never move.

1. For each new node in batch order: the anchor is the `near` hint, else the
   placed neighbour it shares the most wires with, else none.
2. With an anchor: the column is the anchor's column plus one, minus one for
   power parts; the first free row slot scanning down from the anchor's row,
   then up, that does not intersect any placed card with a 24 px margin.
   Column and row here are derived from the anchor's actual coordinates, not
   from a stored grid.
3. With no anchor: appended to the right edge of the content bounds, top
   aligned.
4. `in` a zone: the slot search is confined to the zone's rectangle; if no
   slot fits, the zone grows downward by one row pitch and the search repeats.
5. New zones and notes follow the full-layout rules for zones and notes.

### Invariants the tests assert

No two cards intersect; every zone contains all its members; an edit leaves
every previously placed item at its coordinates; running twice gives identical
output; the weather-station fixture ends with power parts left of the hub and
sensors and radios to its right.

## The agent loop

Per user message:

1. Begin a store batch and an empty touched-id set.
2. Build the messages: thread history, then the user message with the board
   text appended.
3. Call the provider with the system prompt, messages, and tools, streaming
   text to the panel.
4. For each tool call in the reply, execute it. `apply_edits` validates and,
   on success, applies inside the batch, runs incremental layout for anything
   unplaced, and adds the ids to the touched set. Return all results in one
   message, marking failures as errors, and go to 3.
5. Stop when the model ends its turn, or after 8 tool rounds, or on Stop, or
   on an error. End the batch either way: edits applied so far stay as one
   undo step, and the reply says if it was cut off.
6. Set `ui.highlight` to the touched set; fit the view to the board if it was
   empty at the start, otherwise pan the minimum needed to show the new items.
7. Append the assistant's final text to the thread with its undo chip.

Tool calls in one reply run in order; results are returned together. The
thread is append-only. The `Undo this` chip calls `store.undo()` and is
enabled only while that reply's batch is the top of the undo stack, which the
agent tracks by remembering the undo depth after each reply.

## The assistant panel

**Placement.** A floating card in the bottom-right of the canvas area, inside
`#canvas-wrap` like the other panels so it always clears the toolbar, 340 px
wide, capped at 55% of the canvas height, folding to its header through
`collapsible.js`. Toggled by a toolbar button and the `A` key; hidden with the
other panels by `P`.

**Header.** Title, provider and model, a settings gear, a new-thread button,
the fold toggle.

**Thread.** User and assistant messages. Assistant text streams in and is
rendered as paragraphs and `- ` bullets, escaped, no markdown library. Tool
activity appears as small status lines: "searching parts: lora", "applied 12
edits", "checks: 1 finding". Each reply that changed the board carries
"Undo this" and "Show changes" chips. Errors appear as an error bubble. The
thread element is `role="log"` with `aria-live="polite"`.

**Composer.** A text box where Enter sends and Shift+Enter inserts a line
break; a Stop button replaces Send while a request runs; the three quick
actions above it. The current selection, if any, is added to the message as
the `selected:` line.

**Usage line.** Tokens in and out for the last reply and the thread, cache
reads, and an estimated cost when the provider is Anthropic, labelled
"estimate".

**First run.** With no provider configured the panel shows the settings form
inline with the notice: "The board's text is sent to the provider you choose.
Keys stay in this browser."

**Thread lifetime.** Stored under `schematica.ai.thread` and restored on
reload, both the visible thread and the provider-facing history. The history
sent to the model is capped at the last 40 messages; older ones drop off the
prompt, which is safe because every user message carries the current board.
Cleared by the new-thread button and whenever the board is replaced: open,
example, share link, New.

**Canvas feedback.** Touched items get a pulsing ring in the overlay layer
until the next pointerdown on the canvas. Reduced-motion users get a steady
ring.

## Providers, keys, cost, errors

### Settings

Provider (`anthropic`, `openai`, `ollama`), model, base URL, key, effort
(`low`, `medium`, `high`), "remember key on this device", and a Test button.
Defaults: Anthropic at `https://api.anthropic.com` with `claude-opus-5` and
`medium`; OpenAI-compatible at `https://api.openai.com/v1` with a blank model;
Ollama at `http://localhost:11434` with a "list models" fetch. The Test button
sends a probe asking the model to call a `ping` tool and records whether it
did; a provider that did not gets the single-shot mode. The Ollama help text
states that `OLLAMA_ORIGINS` must include the site's origin for browser
access.

Settings live under `schematica.ai.settings`. The key lives under
`schematica.ai.key.<provider>` only while "remember" is ticked; otherwise it
is held in memory for the session. "Forget key" clears it. The key is never
part of the document, autosave, share links, or exports.

### Internal message format

Adapters translate between the wire format and one internal shape: a system
string array (stable block, per-request block), messages of `{ role, content }`
where content is text, tool calls `{ id, name, input }`, or tool results
`{ id, text, isError }`, and tool definitions `{ name, description, schema }`.
Each adapter exposes `chat({ system, messages, tools, signal, onText })` and
resolves to `{ text, toolCalls, usage, stop }` where `stop` is `end`,
`tool_use`, `max_tokens`, `refusal`, or `aborted`.

### Anthropic adapter

`POST {base}/v1/messages` with headers `x-api-key`, `anthropic-version:
2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, and
`content-type: application/json`. Body: `model`, `max_tokens: 16000`,
`stream: true`, `thinking: { type: "adaptive" }`, `output_config: { effort }`,
`system` as an array whose first block carries `cache_control: { type:
"ephemeral" }`, `tools` with `strict: true`, `messages`. Server-sent events
are parsed by `stream.js`; text deltas go to `onText`, tool-call input JSON is
assembled from deltas and parsed once complete, usage comes from the start and
delta events. `stop_reason` maps to `stop`; a `refusal` shows its explanation.

Cost estimate from a built-in table in `settings.js`: Opus 5 $5 in, $25 out,
cache read $0.50, cache write $6.25 per million tokens; Sonnet 5 $2, $10;
Haiku 4.5 $1, $5. Unknown models show tokens only.

### OpenAI-compatible adapter

`POST {base}/chat/completions` with `Authorization: Bearer`, `stream: true`,
`stream_options: { include_usage: true }`, `tools` as function definitions,
`tool_choice: "auto"`. Tool-call argument fragments are concatenated per index
and parsed at the end. Token counts are shown when `usage` arrives; no cost.

### Ollama adapter

`POST {base}/api/chat` with `stream: true`, `tools`, and the model. Newline-
delimited JSON is parsed by `stream.js`. No key.

### Single-shot mode

For a provider whose probe showed no tool calling. The per-request system
block carries the operation schema and asks for exactly one JSON object
`{ "summary": "…", "ops": [ … ] }`. The reply is parsed; if it is not valid
JSON the model is asked once to repair it; then the ops are validated and
applied as one batch. Search and checks are not available to the model in
this mode; the board text and catalogue in the prompt stand in for them.

### Errors

| Condition | Shown as | Behaviour |
|---|---|---|
| 401 / 403 | Invalid or missing key | Opens settings |
| 429 | Rate limited | One retry after the `retry-after` delay or 5 s, then the error |
| Network or CORS failure | Could not reach the provider | With the Ollama origins hint when the provider is Ollama |
| 404 model | Model not found | Opens settings |
| 400 context length | Thread too long | Suggests a new thread |
| `refusal` | The model declined | Shows the explanation |
| `max_tokens` | Reply cut off | Edits so far kept |
| Stop pressed | Stopped | Edits so far kept |

Every error ends the batch. Because a batch validates in full before applying,
a failed request never leaves a half-applied batch.

## Security and privacy

- The model has exactly one way to change the board, and it is validated. It
  cannot run code, load files, or reach anything but the tools listed.
- Board text, including notes, goes to the provider; the first-run notice says
  so. Threat boards may name real systems; that is the user's call.
- Board text and tool results are data, not instructions, and the system
  prompt says so; notes and labels are quoted so they cannot pose as
  structure.
- Keys stay in the browser as described. Settings are excluded from share
  links, files, and autosave by living under separate storage keys.
- Model text shown in the panel is escaped before insertion.

## Testing

Unit tests, `node --test`, no key, no network:

- `tests/ai-ops.test.js`: every operation applies; refs resolve and collide
  correctly; port picking on shared, point-to-point, and untyped buses;
  explicit mismatched ports need a bus and warn; atomic rejection with the
  failing index; `replace_part` rewiring and dropped-wire warnings; the 200
  operation cap; text clamping.
- `tests/ai-layout.test.js`: the five invariants; hub choice; power-left
  columns; zone contiguity; incremental slots down then up; zone growth; notes
  above their anchor.
- `tests/ai-context.test.js`: board text for every example is stable and
  carries every id; the catalogue lists every kind and bus; the selected and
  checks lines appear only when non-empty.
- `tests/ai-providers.test.js`: request bodies for the three adapters against
  fixtures; SSE and NDJSON parsing across split chunks; tool-call argument
  assembly; stop-reason mapping; the price table.
- `tests/ai-agent.test.js`: with a scripted fake provider, a build runs two
  tool rounds and ends; the round cap stops it; abort ends the batch with
  edits kept; the reply is one undo step; the touched set is right; a failed
  batch applies nothing and returns errors to the model; single-shot mode
  parses and repairs.
- `tests/ai-settings.test.js`: the key is stored only when remembered and
  cleared by forget.

Browser checks in `tests/e2e/smoke.mjs`: the test's own server gains a fake
Anthropic endpoint at `/fake/v1/messages` returning scripted SSE, and the app
is pointed at it through the base URL setting. Scenarios: a build request
produces cards, wires, and a zone with no overlapping cards and highlight
rings, and one undo empties the board; the Fix button on a finding sends it
and the finding disappears; the key is absent from storage unless remembered;
the panel folds and toggles with `A`.

Manual acceptance with a real key, listed in the implementation plan: the
four requirements exercised on the Sensor Node and RDK X5 Rover examples.

## Success criteria

- On a blank board, "Build a solar weather station on an ESP32-S3 with a
  BME280 and a LoRa uplink" yields parts, typed wires, at least one zone, no
  overlapping cards, and zero design-rule errors within eight rounds.
- "Swap the ESP32 for an STM32H7" changes exactly one node's part number and
  notes and nothing else.
- "Fix the I2C conflict" on a board with one changes one address.
- "Fill in details" on the RDK X5 Rover fills every blank part number from a
  preset and changes nothing else.
- Every reply is one undo step; the highlight shows what it touched.
- The key appears nowhere in autosave, saved files, or share links.
- With no key and no network, everything else in Schematica works as before.
- Both suites pass in CI without a key.

## Doors left open

- **Text format.** The board text is the reader half of a text form of the
  document; a parser makes paste, git review, and CI rules possible.
- **MCP server.** `tools.js` over a plain document is what a Node MCP server
  would expose so Claude Code and other agents can drive Schematica.
- **Per-change revert.** The touched set and the change list per reply are
  the bookkeeping it needs.
- **Image input.** One more content block on the Anthropic adapter.

## References

- Anthropic Messages API, tool use, structured outputs, prompt caching:
  `platform.claude.com/docs`
- Anthropic TypeScript SDK README, browser support: the API accepts direct
  browser calls when the request opts in
- Ollama API: `github.com/ollama/ollama/blob/main/docs/api.md`
- OpenAI chat completions with streaming and tools: `platform.openai.com/docs`
