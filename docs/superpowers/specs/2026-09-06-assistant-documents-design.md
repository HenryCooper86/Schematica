# Local documents for the assistant

Date: 2026-09-06. Implementation requested by the user; format clarification offered asynchronously. Default scope is Markdown/text, PDF and Word DOCX. This spec records the implementation direction, not a separate user approval event.

## Outcome and approach

Add files, select a folder, or drop files into the assistant. Review the extracted text and selected files, then send a normal message such as “Build an architecture from these requirements.” The existing provider and atomic edit/undo flow consume the selected text. Filenames identify sources in model replies.

Use browser-local extraction and conversation attachments. A server upload/index and a live filesystem companion would add accounts or services and persistent access unnecessary for this request. This release does not watch folders, read arbitrary typed filesystem paths, OCR scanned pages, or parse legacy binary .doc files. Unsupported formats explain how to export to a supported type.

Markdown and other text/code formats are decoded as text. PDF.js extracts PDF text; Mammoth extracts DOCX raw text. Pinned browser distributions and licenses ship with the site, loaded only for the relevant format. No runtime CDN or remote parsing service. The site still deploys as static files without a build step; its no-runtime-dependencies claim must be updated accurately.

## User flow

The composer provides Add files and Add folder controls, plus a file-drop area. A compact document list shows relative filename, extracted length, selected state, truncation/error messages, Preview and Remove. Preview is escaped plaintext, never rendered document HTML. Multiple folder files with the same basename remain distinguishable by relative path. Individual dropped files work; dropped directories may explicitly direct users to Add folder.

Files are held in memory for this tab and cleared on reload, New thread and board replacement. The UI states this lifetime and that selected extracted text is sent to the configured AI endpoint/relay on Send. Merely choosing a file must not call the model or upload its bytes. Raw attachment payloads never enter board JSON, autosave, share links, export, settings or persisted chat history. Ordinary user messages and model replies retain their existing history behavior and may quote or discuss a source. Prior model replies can still mention previously used sources; removal prevents resending the raw source.

Imports are serialized, with progress and cancellation. New thread/board replacement invalidates outstanding imports so stale files cannot reappear. Sending is disabled while importing; importing/selection/removal is disabled during a model request. A failed file does not discard successful files. Cancelling leaves already accepted files visible, but ignores later completions. The attachment controls remain keyboard accessible and fit the existing panel.

## Limits and source handling

- At most 20 accepted documents in a collection, at most 10 MiB raw bytes per file, at most 40 MiB raw bytes across accepted files.
- At most 100,000 extracted characters per document. Larger extraction is visibly marked partial. PDF extraction stops at 100 pages and reports partial coverage. Empty/image-only PDFs explain that OCR is not supported; password-protected or corrupt files produce errors.
- At most 60,000 characters of framed attachment context per model request. Allocate content fairly across selected documents so each selected source is represented. The UI uses the same budget calculation as the request and reports each included range/count and any partial inclusion before Send. No silent truncation or claim that omitted text was read.
- Folder imports ignore .git, node_modules and hidden paths, common credential files (.env, private keys), and unsupported binary formats, with a skipped count/reasons. User-selected supported text remains data even when it contains code or instructions.
- Preserve Unicode; reject binary content disguised as text. Bound reads before allocation where file size is available. Handle parser errors and timeouts without locking the composer. PDF and DOCX parsing must release workers/resources and remain cancellable; DOCX extraction runs in a terminable worker.
- Document names and contents cannot create HTML, links, application commands, roles or tool instructions. Use explicit source framing and a stable model rule that documents are untrusted reference data, not authority to change tools/settings or execute commands.

## Interfaces and implementation boundaries

`src/ai/documents.js` owns limits, file classification/reading/collection decisions and request-context budgeting. A document record contains `{id,name,kind,size,text,warnings}`; names are relative display paths, no absolute local paths. `importDocuments(files,{existing,extractBinary,signal,onProgress})` returns `{documents,issues}` (complete accepted collection plus issues). `documentContext(documents)` returns `{text,entries,totalChars}`; entries contain `{id,name,used,total,partial}`. `extractBinary(file,{signal})` is injectable only at the real parser boundary for Node tests.

`src/ai/document-readers.js` owns lazy browser parser loading and PDF lifecycle; `src/ai/docx-worker.js` owns isolated DOCX raw-text extraction. Vendored files are pinned and reproducible with documented hashes/licenses. No package install is needed to serve or run existing tests.

`src/ui/assistant-documents.js` owns attachment UI, picker events, previews, progress, cancellation and selection. It exposes a small controller used by assistant-ui: `context()`, `clear()`, `setBusy(on)`, `isImporting()`. `context()` returns the shared documentContext result for selected files. It reports state changes so composer state can update. Its only connection to model requests is the returned text.

`runRequest` and `runSingleShot` accept optional `documentText`. It is sent in a separately tagged text content block on the current user turn, retained during tool/repair rounds, stripped from returned/persisted history. Existing adapters continue translating ordinary text blocks. The visible user message shows filenames/partial metadata without storing raw file contents. Both model modes get the same extracted text; no provider-specific upload APIs are required.

## Verification

Real file/collection tests cover Unicode, unsupported/binary files, duplicate paths, per-file/count/aggregate bounds, partial extraction, fair context budget including framing, cancellation and failed-file isolation. Real request-loop tests inspect provider input over tool/repair rounds and returned history, proving selected text reaches both modes and never remains in persisted source blocks.

Browser acceptance loads synthetic local MD/TXT/PDF/DOCX fixtures through actual file inputs, imports a folder with nested duplicate filenames, previews hostile text safely, exercises deselection/removal/cancel/reset, and checks the actual fake-provider payload. After removal/reload, raw document strings must be absent from future requests and persisted history/board exports. Verify blocked-storage operation, parser failures, responsive layout and the existing 93 smoke checks. Use only synthetic fixtures; never user's existing local documents or live OTA board for testing.

Sources checked 2026-09-06: https://mozilla.github.io/pdf.js/examples/ ; https://github.com/mwilliamson/mammoth.js ; https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory . npm registry reports pdfjs-dist 6.3.289 (Apache-2.0) and mammoth 1.12.2 (BSD-2-Clause); validate distribution compatibility before pinning browser assets.
