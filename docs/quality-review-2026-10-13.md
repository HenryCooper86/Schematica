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
