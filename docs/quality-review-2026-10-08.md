# Project bug audit — 8 October 2026

Reviewed the working tree based on commit `2d4a059`. This audit covered document
state and history, serialization, subsystem analysis, engineering checks,
recovery, asynchronous editor actions, assistant operations, imports, and server
and team-review paths. Reproduced issues were fixed and protected by regression
tests. The results below cover local source and workflow verification.

## Fixed issues

| Area | Reproduced problem | Resulting behavior |
| --- | --- | --- |
| RDK software targets | Grouping a valid software/board pair into a subsystem made its target appear missing. Adding an unrelated subsystem could also invalidate a root target. | Flattened analysis qualifies software references in the same scope as node IDs. Missing references cannot bind to a sibling scope, and analysis leaves the saved document unchanged. |
| Required interface declarations | Complete power/ground connections were incorrectly required to supply protocol and rate text. Signal connections with display text could pass despite missing numeric limits or endpoint declarations. | Required-interface findings use the same declaration rules as validation coverage. Power and ground require their applicable declarations; flow and relationship links are excluded; missing numeric limits and endpoint evidence are reported. |
| Delayed cut | Editing the board while a clipboard write was pending allowed Cut to delete newer work even though the clipboard contained an older snapshot. | A pending Cut removes its original selection only when the board still matches the copied snapshot. Otherwise it completes as Copy, preserving edits and history. |
| Delayed file opening | A slow file read could overwrite newer edits, a replacement board, a newer file choice, or an active drag. | File opening checks request order, board identity, root content, and active batches before replacing the board. Stale reads preserve current work, and the retry message is translated into Chinese. |
| Fallback revision recovery | Without IndexedDB, Retry did not persist failed localStorage snapshots. Failed writes could prune pending snapshots, while successful snapshots cached in memory hid another writer's deletion or rotation. | Retry persists the original pending IDs and metadata. Failed snapshots remain recoverable, successful snapshots leave pending memory, and count/byte rotation applies to durable records only after a successful write. |

Added **30 regression tests** across RDK checks, required interfaces, clipboard
commands, file opening, and revisions. Each reproduced defect was checked against
the original behavior before its production fix. Tests also cover normal
completion, undo, nested scopes, translations, partial retries, reloads, and
cross-instance removals. Independent review found no concrete issues in the
final patches.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm test` | 1,015 passed; zero failures or skips (baseline: 985 passed) |
| `npm run lint` | Source syntax, local imports, whitespace, and browser module reachability passed |
| Python 3.14 deployment tests | 7 passed; zero skips |
| Chrome main smoke suite | 263/263 |
| Chrome recovery/workflow suite | 17/17 |
| Chrome presentation suite | 17/17 |
| Chrome assistant skills suite | 12/12 |
| Chrome web-source suite | 8/8 |
| Chrome responsive layout suite | 168/168 |
| Chrome rendering enhancements suite | 5/5 |
| Chrome engineering suite | 38/38 |
| Native Firefox suite | 116/116 |
| `git diff --check` | Passed |

Chrome suites ran sequentially and reported no console errors or exceptions.
Firefox reported no captured browser errors or unhandled rejections. Browser
reports and logs are retained locally under `.acceptance/chrome/` and
`.acceptance/firefox/`.

This is a source and automated-workflow audit, not proof that every possible bug
has been eliminated. It did not exercise paid live assistant providers, physical
hardware, a production deployment, native Safari, or new real KiCad file trials.
Browser fixtures cover simulated providers and import/review workflows.
