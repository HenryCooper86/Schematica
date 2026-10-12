# Project bug audit — 12 October 2026

Reviewed the working tree based on commit `1ccde202`. This pass examined document
notifications, undo/redo and autosave, assistant conversation persistence and
input handling, interface checks and review output, presentation relationships,
and adjacent editor and provider paths. Reproduced defects were fixed with
regression coverage; unused imports were removed from tools and subsystems.

## Fixed issues

| Area | Reproduced problem | Resulting behavior |
| --- | --- | --- |
| Assistant conversations | Creating a conversation relied on `crypto.randomUUID`, which is unavailable on nonsecure HTTP origins. | Conversation creation uses the existing `getRandomValues`-based ID helper. Independent threads and drafts persist and reopen; existing IDs remain valid. |
| Unchanged edits | Committing an unchanged property notified document subscribers, causing unnecessary rendering and root-document reconstruction for autosave. | Unchanged edits preserve undo/redo and skip document work. Selection-only changes still emit a selection event. Normalized part numbers, schema fields, default lane labels, and capped stop captions update their controls directly so displayed text matches saved content. |
| Chinese input composition | Enter could send the assistant prompt or commit an inline rename before IME composition finished; Escape could close an active rename. | Composing key events, including the legacy key-code fallback, preserve the draft/editor. Ordinary Enter still commits or sends afterward. |
| Interface compatibility | Flow and relationship links could retain electrical declarations and generate false compatibility errors, despite being excluded by coverage and checklist rules. | Compatibility and review output consistently exclude these relationship links. Electrical connections retain their existing checks. |
| Reverse presentation arrows | Authored reverse arrows were rendered as an undirected relationship and described as direction unspecified. | Relationship explanations preserve the reverse arrow and authored-direction wording in presentations and offline HTML exports, regardless of stop order. |

Added **10 Node regression tests and two browser checks**. Each new failure was
observed before its corresponding fix. An independent patch review found two
minor side-effect families in the initial unchanged-edit optimization: input
normalization and stale-selection notifications. Both were corrected and
rechecked; the reviewer found no remaining concrete issues and independently
passed 153 focused tests and source checks.

## Fresh verification

| Check | Result |
| --- | --- |
| `npm test` | 1,104 passed; zero failures or skips (baseline: 1,094 passed) |
| `npm run lint` | Source syntax, local imports, whitespace, and browser module reachability passed |
| Python 3.14 deployment tests | 7 passed; zero skips |
| Chrome main smoke suite | 296/296 |
| Chrome presentation suite | 18/18, including the caption normalization regression |
| Chrome assistant history suite | 16/16, including the composition regression |
| Chrome recovery/workflow suite | 17/17 |
| Chrome assistant skills suite | 12/12 |
| Chrome web-source suite | 8/8 |
| Chrome responsive layout suite | 174/174 |
| Chrome rendering enhancements suite | 5/5 |
| Chrome engineering suite | 38/38 |
| Native Firefox suite | 117/117 |
| `git diff --check` | Passed |

Chrome suites ran sequentially and reported no console errors or exceptions.
Firefox reported no captured browser errors or unhandled rejections. Browser
reports and logs are retained locally under `.acceptance/chrome/` and
`.acceptance/firefox/`.

This pass does not establish that every bug has been eliminated. Automated IME
checks use synthetic key events. Paid live assistant providers, physical
hardware, a production deployment, native Safari, and new real KiCad file trials
were not exercised. Browser fixtures cover simulated providers and import/review
workflows. Verification ran locally before publishing these changes.
