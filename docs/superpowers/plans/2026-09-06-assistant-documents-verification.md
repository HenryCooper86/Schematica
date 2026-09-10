# Assistant document verification

Implemented local file/folder/drop attachments for Markdown, text/code, PDF and DOCX. Files are extracted locally with bundled lazy parsers and held in tab memory. Selected sources share a 60,000-character framed request budget; previews and partial inclusion are visible before Send. Raw attachment blocks remain available during active tool/repair rounds and are removed from returned history; ordinary conversation can retain quotations.

Verified production tree: `98f1d7f` (feature branch based on `6e7b067`).

- Unit suite: 375/375 passed.
- Full Chrome browser suite: 116/116 passed at `0694a4b`, with no console errors or exceptions.
- Final change `98f1d7f` only strengthens asynchronous test settlement; focused browser suite: 23/23 passed afterward, with no console errors or exceptions.
- Actual browser file and folder pickers, real PDF/DOCX extraction, Unicode provider payload, escaped names/text, bounded source frames, selection/removal, exports/storage, cancellation, reset, reload and blocked storage were exercised using synthetic fixtures and a disposable browser profile.
- Desktop, preview and narrow 430×820 screenshots were inspected. With the existing palette collapsed, 20 sources keep the composer visible and hit-testable.
- All 190 bundled asset hashes and exact inventories were independently verified against pinned manifests.
- Task-scoped and final whole-branch reviews approved the implementation with no required changes.

Encrypted PDF errors, forced 30-second parser timeouts and synthetic dropped-directory entries were not forced in browser acceptance. Their handling is implemented; no OCR, legacy binary .doc parsing or live folder watching is provided.

This feature is integrated locally. Publishing requires a separate deployment action.
