# Project bug audit — 13 October 2026

Reviewed the working tree based on commit `b33bdcd`. This pass examined editor
gestures and document replacement, undo and selection, startup recovery,
revision storage and conflicts, subsystem reviews, CSV interchange, Engineering
forms, assistant persistence and provider paths, and shared-review server code.
Changes address reproduced defects and verified unused code.

## Fixed issues

| Area | Reproduced problem | Resulting behavior |
| --- | --- | --- |
| Failed edits | An exception restored the document but left selection mutations behind. | Document and selection roll back together without an undo step. |
| Original recovery data | Deleted or unreadable archives could still appear durably saved. A storage-clear event did not refresh recovery state. Malformed metadata produced unusable review entries, and retry could mark a mismatched archive identity as safely stored. | Original bytes remain in memory, missing or invalid copies lose their saved status, and the recovery warning returns. Retry can recreate deleted copies and validates existing archive metadata before unblocking autosave. |
| Cross-tab conflicts | Invalid remote JSON prevented the local board from being preserved as a conflict revision. | The local snapshot is saved before decoding the remote value. Invalid remote data remains untouched. |
| Revision metadata | Invalid IDs, timestamps, and mismatched local-storage keys could crash sorting or prevent migration. Malformed records already in IndexedDB blocked new durable writes. | Shared metadata validation excludes invalid entries from recovery operations while retaining valid history. Database writes leave malformed existing records untouched for manual recovery and reject malformed incoming records atomically. |
| Revision time boundary | A snapshot at the maximum supported date caused the next timestamp to exceed the valid date range and disappear on reload. | Generated timestamps stay within the supported date range. |
| Subsystem review | Starting a review inside a subsystem saved only that child document into architecture-wide revision recovery. | Review snapshots preserve the complete root architecture. |
| CSV round trips | Literal apostrophes before formula-like values were removed on import. Spreadsheet byte order marks broke header matching. | CSV exports add a reversible formula guard, imports remove exactly one guard, and the parser accepts an initial byte order mark. |
| Editor lifecycle | A replaced board could inherit an old drag or inline rename, including when IDs were reused. Tool changes could invalidate an active wire draft, and lost pointer capture left moves unfinished. | Replacement cancels transient editors and gestures. Tool changes and lost capture abandon gestures safely; canceled moves do not create undo steps. |
| Connection picker | A delayed bus choice could create a wire after an endpoint was removed. | The picker checks the document generation, content, and editing state before committing. Selection changes alone remain allowed. |

Removed the unused `rectContains`, `profileSummary`, and `THREAD_KEY` exports and
their obsolete assertions. The conversation migration still reads its legacy
thread key. Revision readers now share one validation path instead of repeating
partially different checks. A delayed connection-picker dismissal timer also
avoids attaching a listener after the picker has closed.

## Verification

Added 17 Node tests and four browser checks. The 16 new Node defect regressions
and four browser regressions failed before their respective fixes. The remaining
Node test verifies that changing selection still permits a valid bus choice.
Removed one test that exclusively exercised a deleted unused helper.

| Check | Result |
| --- | --- |
| `npm test` | 1,151 passed; zero failures or skips (baseline: 1,135 passed) |
| `npm run lint` | Source syntax, local imports, whitespace, and browser module reachability passed |
| Python 3.14 deployment tests | 7 passed; zero skips |
| Chrome main smoke suite | 343/343 |
| Chrome startup recovery and form reliability suite | 24/24, including storage-clear recovery and preservation retry |
| Chrome recovery/workflow suite | 19/19, including complete subsystem snapshots and malformed IndexedDB records |
| Native Firefox suite | 132/132 |
| `git diff --check` | Passed |

The completed browser runs reported no captured console errors, exceptions, or
unhandled rejections. Reports are retained locally under `.acceptance/chrome/`
and `.acceptance/firefox/`. These results cover local verification before
publication of the fixes.

The final archive metadata guard was verified with the full Node and source
checks and Chrome's focused startup-recovery reliability suite.

This is a repository audit, not proof that every possible defect has been
eliminated. Browser fixtures use simulated providers. Paid live providers,
physical hardware, production deployment, native Safari, and new real KiCad
file trials were not exercised.

## Follow-up audit — 15 October 2026

This pass traced GUI editing, nested-board handoff, interchange, engineering
calculations, and recovery boundaries. Independent implementation slices were
followed by integrated verification and a read-only correctness review.

### Corrected defects

| Area | Reproduced problem | Correction |
| --- | --- | --- |
| Oversized copy/cut | Cut could delete a selection whose encoded clipboard payload exceeded the paste limit. | Reject oversized payloads before replacing either clipboard or deleting items. |
| Partial cut | A separately selected wire could be deleted even though its endpoints were absent from the copied selection and the wire was omitted. | Delete only explicitly selected items represented in the payload; normal cascading removal from deleted nodes is unchanged. |
| Custom-part editor | A draft from a replaced board could overwrite a new node with a reused ID or write stale library data. | Replacement closes and invalidates the editor; save checks document generation and dialog state. |
| Multiple pointers | An unrelated pointer could move, finish, or cancel another pointer's gesture. | One pointer owns each gesture through completion or cancellation. |
| Custom-field persistence | A valid `__proto__` field ID disappeared silently during deserialization, including in nested boards. | Construct own-property field maps without invoking inherited setters. Regression coverage also includes `constructor` and `toString`. |
| Share size and feedback | Encoding accepted highly compressible boards beyond the decoder's 16 MiB limit. The GUI classified encoding failures as clipboard denial. | Enforce the decoded UTF-8 size before compression and report encoding errors separately from clipboard errors, including Chinese size-limit feedback. |
| Raster failure handling | An unavailable canvas context caused PNG/PDF callbacks to throw, leak the SVG URL, and leave callers uninformed. | Revoke the URL and complete with the existing null-result failure contract. |
| Independent I2C buses | Address checks merged separate controller ports and reported false conflicts. | Build net connectivity from node-and-port endpoints; explicit wire paths still join address spaces. |
| Converter peaks | Converter aggregation merged independent scope excursions, hiding an overload; it also double-counted same-scope noncoincident excursions. | Preserve and scale excursion identities through conversion stages. |
| Reviewed exceptions | Supplementary Unicode edits such as `😀` → `😁` retained stale exceptions. | Hash every UTF-16 code unit. Existing affected exceptions may require review once. |
| Share scope | Sharing from an expanded subsystem omitted the rest of the architecture. | Share the complete reconstructed root, including live child edits, consistently with Save. |
| Comparison scope | Comparing an unchanged saved architecture while a child was open reported spurious additions and removals. | Compare the complete root instead of the focused child. |

The Interfaces panel also indexes wires once per paint instead of scanning the
wire array for every worklist row. This removes that quadratic lookup; it is not
a claim that all rendering or analysis is linear. No speculative dead-code
deletions or broad stylistic rewrites were made. Browser-entrypoint reachability
and local imports pass the existing source checks.

### Verification

Added 14 Node regressions and two permanent GUI regressions. Targeted defect
reproductions preceded their fixes. The I2C regression uses a normalized custom
definition and a valid inter-node bridge rather than a self-wire rejected by the
file loader.

| Check | Observed result |
| --- | --- |
| `npm test` | 1,165 passed; no failures or skips |
| `npm run lint` | Source syntax, imports, whitespace, and browser module reachability passed |
| `npm run e2e` | 345/345 Chrome GUI checks |
| `RELIABILITY_E2E_ONLY=1 npm run e2e` | 26/26 permanent reliability checks |
| `npm run e2e:firefox` | 132/132 native Firefox checks |
| Python 3.14 deployment helpers | 7/7; no skips |
| Corrected valid I2C fixture, `node --test tests/drc.test.js` | 28/28 |
| Throwaway share-size feedback smoke | Failed before the GUI error split; passed afterward; incidental wording assertion removed |

Chrome and Firefox suites reported no captured browser errors or unhandled
rejections. The final full Chrome report is retained under
`.acceptance/chrome/audit-final/`; Firefox evidence is under
`.acceptance/firefox/`.

The existing browser benchmark also completed at 100, 500, and 1,000 nodes
(30 samples after three warmups). Current synchronous medians:

| Nodes | Wires | Render | Programmatic drag update | Search | Design checks | SVG export |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 99 | 0.7 ms | 3.3 ms | 0.1 ms | 0.2 ms | 0.4 ms |
| 500 | 499 | 2.6 ms | 6.25 ms | 0.3 ms | 0.4 ms | 2.1 ms |
| 1,000 | 999 | 5.2 ms | 9.4 ms | 0.5 ms | 1.0 ms | 4.5 ms |

These are local JavaScript timings, excluding event transport and paint—not
native input-to-paint latency or a measured before/after speedup. Raw results:
`.acceptance/chrome/audit-performance.json`.

The actual GUI was also inspected: an unchanged root file reports no differences
while its child remains open; separate controller I2C ports do not report an
address conflict; and the converter scenario displays 70 mA typical, 150 mA peak,
and the 130 mA supply-overload finding previously missed.
GUI file-open → Save → reopen also preserves own values for `__proto__`,
`constructor`, and `toString` in a nested custom part. Direct main-world browser
fault injection confirms the share-size error is displayed in English and Chinese,
separately from clipboard-permission failures.
Saving a reviewed exception and then editing requirement text from `😀` to `😁`
through the GUI expires that exception. Independent correctness and focused
input-boundary reviews found no patch-introduced defects.
Additional GUI smoke confirms ordinary custom-part saving, dismissal and stale-save
rejection after a reused-ID board replacement, and PNG/PDF/Copy PNG failure
feedback with button recovery when canvas contexts are deliberately unavailable.

After resuming from the user-requested pause, the main assistant completed the
remaining Chromium pointer smoke directly. Native two-touch input confirmed that
the second pointer cannot move or finish the first pointer's drag: the owner
continued from a 40 px move to 80 px while the other part stayed still, and one
Undo restored the original board. Injected cancellation and capture-loss events
from an unrelated pointer left the drag active; native cancellation of the owner
restored its original position without an undo step. No browser errors were
captured. The interrupted independent GUI worker produced no validation results;
its temporary driver was removed, and no independent runtime result is claimed.

This follow-up is not proof that all possible defects are eliminated. Provider
fixtures do not establish live-provider correctness; no physical hardware,
production deployment, native Safari, or new real KiCad files were exercised.

## Continued audit — 15 October 2026

The next pass covered assistant request modes and source attachments, recording
startup/finalization, animated exports, presentation lifecycle, connection
defaults, KiCad updates, and the remaining native-browser and public-release
verification boundaries.

### Additional fixes

| Area | Verified defect | Correction |
| --- | --- | --- |
| Interrupted assistant streams | Stop or a later network error erased text already displayed. The alternate structured-plan request mode had the same failure and accepted obsolete callbacks. | Preserve received text in the reply and conversation on interruption in both request modes; ignore callbacks after cancellation, replacement, or completion. Failed quiet JSON repair retains the visible response without duplicating assistant turns. Incomplete plans never apply. |
| Binary attachments | Hashing read the file once, then PDF/DOCX extraction read it again; the second read could fail or observe another snapshot. | Pass the already-hashed ArrayBuffer to extraction without copying, before worker transfer. Real DOCX parsing, context inclusion, deduplication, size checks, and cancellation remain covered. |
| Retained panel buttons | A canceled touch left compatibility-click suppression set indefinitely, disabling subsequent keyboard activation. Another pointer could release suppression prematurely. | Track the owning pointer, clean up release/cancel listeners, reject secondary presses, and restore keyboard activation after owner completion or cancellation. |
| Connection defaults | Selecting the second card initialized both connection endpoints to that same card and disabled submission. | Choose a distinct second eligible part while respecting one or two selected parts. |
| KiCad update selection | Applying a removal left deleted parts/wires selected and toolbar Remove enabled for nonexistent items. | Prune selection inside the same document transaction before notifying subscribers. Surviving selection and one-step Undo/Redo remain valid. |
| Export snapshots | Edits, replacement, language, or theme changes could mix different boards into loop frames. Delayed PNG/PDF filenames could name a replacement board rather than the rendered board. | Freeze loop content/labels/theme once and retain the original filename for each asynchronous export. |
| Recorder ownership | Stop released video ownership before final encoder events; old decodes/chunks/errors could contaminate or abort a successor. Failures leaked across sessions, and encoder errors could download partial video. | Retain finalization ownership and encoding state; gate asynchronous work by session/encoder identity; reset failure counts and discard aborted chunks. Match each frame's SVG theme and canvas background. |
| Pending capture startup | Cancel during microphone permission or music loading did not prevent later recording, and activation controls remained enabled. | Make startup observable and cancellable, release late streams, and disable conflicting starts. Cancel/Escape/backdrop paths cancel pending startup. GIF audio availability follows the selected format and language rebuilds. |
| Recorded annotations | An image decoded after a chapter change used the new caption/counter over the old camera image. | Capture caption, counter, and source viewport width with each frame before decoding; rendered annotations stay with their captured image. |
| First recording activation | The Stop double-click debounce also ignored the first Rec click during the initial 500 ms after loading. | Apply that debounce only after an actual Stop, so a fast first activation opens the dialog. |
| Presentation lifecycle | Relabelling Show all returned to a chapter; old Go tweens survived replacement; pending moment links could reopen after exit or throw on an already-open modal. | Preserve all-board mode, cancel replaced-board tweens, invalidate obsolete link requests, use modal-safe opening, and surface share-size errors. |

### Loop-export performance

Review caught a performance regression in the first snapshot fix: it retained
60 complete SVG sources and generated all of them before decoding any frame.
The final implementation parses one detached SVG snapshot and uses the existing
absolute-time frame baker and XML serializer for each frame.

One local observation per implementation used the same 1,000-node/999-wire board:

| Implementation | Initial synchronous click work |
| --- | --- |
| Eager generation of 60 SVG sources | 500.2 ms |
| One detached SVG snapshot | 45.9 ms |

This measures startup JavaScript only; decoding was deliberately stopped after
initial materialization. It is not total GIF encoding time, a distribution of
samples, or representative-device input latency. Raster-frame retention and final
GIF encoding remain bounded by the existing export limits.

The browser regression rasterizes and decodes a real 60-frame GIF while the
board, language, and theme change. It checks frozen content and filename,
independently rendered flow/halo/blink/footprint phases, decoded frame count, and
requested width. It replaces the former fake-DOM loop test.

### Verification and operational evidence

| Check | Result |
| --- | --- |
| Node suite | 1,206 passed, no failures or skips; 1,165 before this pass |
| Source checks | Syntax, imports, whitespace, and browser module reachability passed |
| Full Chrome suite with genuine KiCad fixtures | 369/369 |
| Focused real GIF regression | 3/3 |
| Native Firefox 155.0.1 with genuine KiCad fixtures | 153/153 |
| Native Safari 27.0.1 with genuine KiCad fixtures | 154/154 in an isolated foreground run |
| Focused native Safari presentation | 18/18 |
| Public production release verification | Health plus five selected committed-asset hashes passed |
| Public Pages release verification | Revision marker plus the five selected asset hashes passed |
| Non-billable Ollama model discovery | HTTP 200, JSON response with 18 models |

Fresh exports came from KiCad 10.0.6. Five supported official designs preserved
every component reference and net/pin membership after save/reload:
pic_programmer, complex_hierarchy, multichannel_mixer, RoyalBlue54L-Feather, and
StickHub. CM5_MINIMA_3, with 100 connected pins on one component, was explicitly
rejected at the shared 64-port limit rather than silently truncated.

Safari exposed two harness prerequisites: hidden Safari can acknowledge native
input without dispatching it, and asynchronous board-file imports must complete
before checking their rendered results. Native input is still required; the
runner activates Safari and asserts visibility/focus. Exact topology comparisons
remain unchanged. An earlier playback interruption under concurrent browser
activity was not assigned an unproven application cause; focused presentation
and the complete isolated native run passed without weakening playback checks.

Additional actual-GUI smoke verified normal and structured-plan partial replies
survive Stop with controls unlocked; canceled microphone startup stops a late
controlled stream; a real browser encoder produces a decodable video and blocks
restart during finalization; selecting the second part opens distinct connection
endpoints; and removing the selected KiCad part clears Remove and restores
topology with one Undo. Canceled panel touches again permit native Enter.
A real delayed-frame capture retained “First frame caption” and its first-chapter
counter while presentation had already advanced to the second caption. The same
GUI smoke opened recording on its first click at 216 ms after navigation. An
incidental exact-format-label test was removed rather than repinned.

Evidence is retained under `.acceptance/chrome/continued-final/`,
`.acceptance/chrome/continued-media-final/`,
`.acceptance/firefox/continued-audit/`,
`.acceptance/safari/continued-isolated/`, and `.acceptance/kicad/`.
Read-only public checks used committed revision
`bcfdb2d1a74a2ca18aac39ec71e58eebc8673b56`; this does not establish that
uncommitted audit changes are deployed.

### Still external

- Paid live inference needs an explicitly configured provider/model, a supplied
  acceptance key, and spending authorization. The acceptance environment had no
  `KEY`, `PROVIDER`, `MODEL`, or `BASE`. Public model discovery and controlled
  provider streams are not evidence of live model quality.
- Representative physical laptops, real hardware observations, and consented
  engineer sessions are not available through this checkout. Same-Mac browser
  checks and public KiCad examples do not substitute for that evidence.
- No production change or restore drill was performed. An actual deployment or
  isolated recovery exercise needs the operator-approved target, credentials,
  and backups; public health/hash checks establish only their recorded scope.
