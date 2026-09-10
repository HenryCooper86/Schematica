# Assistant Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed selected local files/folders to the existing AI assistant through reviewed text attachments.

**Architecture:** Pure import/budget logic and isolated browser parsers feed a focused attachment UI. Request loops attach source text transiently; providers and board edit operations remain unchanged.

**Tech Stack:** Static browser ES modules, pinned bundled PDF.js/Mammoth browser assets, Node tests, existing Chrome/CDP smoke harness.

**Spec:** `docs/superpowers/specs/2026-09-06-assistant-documents-design.md`

## Global Constraints

- At most 20 accepted documents in a collection, at most 10 MiB raw bytes per file, at most 40 MiB raw bytes across accepted files.
- At most 100,000 extracted characters per document. Larger extraction is visibly marked partial. PDF extraction stops at 100 pages and reports partial coverage.
- At most 60,000 characters of framed attachment context per model request. The UI uses the same calculation and reports partial inclusion before Send.
- Raw attachment payloads never enter board JSON, autosave, share links, export, settings or persisted chat history. Ordinary user messages and model replies retain their existing history behavior and may quote or discuss a source.
- Files remain in this tab's memory until reload, New thread or board replacement. No model request occurs on import.
- No runtime CDN or remote parsing service; static deploy without a build step. Bundle pinned parsers/licenses and update dependency claims.
- Document text and filenames are untrusted reference data, never executable HTML, commands or higher-priority model instructions.
- Use synthetic fixtures and isolated browser tests; never alter the user's live OTA board or provider credentials.

## Task 1: Local extraction, bounded collection and source context

**Files:** Create `src/ai/documents.js`, `src/ai/document-readers.js`, `src/ai/docx-worker.js`, `tests/ai-documents.test.js`, `tests/fixtures/documents/` synthetic fixtures, `vendor/pdfjs/`, `vendor/mammoth/`, `scripts/vendor-document-readers.mjs`. Modify `THIRD_PARTY_NOTICES.md`.

**Produces:** `importDocuments(files,{existing=[],extractBinary,signal,onProgress}) -> Promise<{documents,issues}>`; documents `{id,name,kind,size,text,warnings}`; `documentContext(documents) -> {text,entries,totalChars}`, entries `{id,name,used,total,partial}`; exported limits and supported accept list; browser `extractBinary(file,{signal}) -> Promise<{text,warnings}>`. Keep classifier and name sanitization helpers internal unless real UI needs them. Worker protocol documented in report.

- [ ] Write failing behavior tests using real File/Blob-like inputs (Node File supported), literal UTF-8 text, binary NUL data, nested names and oversize File metadata. Cover cancellation/partial successes/dedupe (same relative path+size+content metadata) and count/aggregate byte caps before reading rejected files.

```js
const out = await importDocuments([new File(['sensor: IMX219\n电源: 5V'], 'requirements.md')], {});
assert.match(out.documents[0].text, /电源: 5V/);
const context = documentContext(out.documents);
assert.match(context.text, /requirements.md/);
assert.ok(context.totalChars <= 60000);
```

- [ ] Run `node --test tests/ai-documents.test.js`, inspect expected missing-feature failures. Implement the file allowlist, relative name validation, folder excludes, deterministic duplicate handling, byte/text/page limits and fair framed context budget. Every selected source must get an entry; framing overhead counts against 60,000. Expose partial coverage truthfully and reject oversized names instead of letting framing exceed budget.
- [ ] Vendor minimal browser assets from pinned official npm distributions, with license and integrity/source record plus reproducible script (not a runtime fetch). Inspect package compatibility; latest candidates pdfjs-dist6.3.289/mammoth1.12.2. Use PDF getDocument({data,...}) and page getTextContent with worker lifecycle/cancel/timeouts. Use Mammoth extractRawText in terminable worker, no HTML conversion or external file access. Fail clearly for scanned/encrypted/corrupt files; release resources on success/error/abort. Do not install an app build pipeline.
- [ ] Create small original synthetic PDF and DOCX fixtures containing independent known marker text, no copyrighted or user content. Include corrupt/image-only samples where practical and fixture-generation provenance. Browser reader integration is exercised in Task3; Node boundary tests may inject only extraction function, not fake collection behavior.
- [ ] Run focused tests then full `npm test` once; self-review and commit only task files. Report red/green commands, counts, exact parser versions/assets, interface shape and any browser compatibility uncertainty.

## Task 2: Attachment UI and transient assistant request context

**Files:** Create `src/ui/assistant-documents.js`, `tests/ai-document-context.test.js`; modify `src/ui/assistant-ui.js`, `src/ai/agent.js`, `src/ai/prompt.js`, `css/style.css`; existing related tests when changed behavior requires it.

**Consumes:** Task1 importDocuments/documentContext/extractBinary APIs. **Produces:** attachment controller `initAssistantDocuments({container,onChange})` exposing `context()`, `clear()`, `setBusy(on)`, `isImporting()`; `context()` shared result for selected files. Both request modes gain optional `documentText=''` argument.

- [ ] Add failing real request-loop tests: fake provider inspects selected source text on initial and subsequent tool rounds, returned history excludes only tagged source blocks, new request with no selected files lacks raw source, and single-shot repair still sees current sources. Preserve ordinary user text that happens to contain source delimiters.

```js
const res = await runRequest({provider,executor,userText:'Use my requirements',boardText:'board demo',documentText:'SOURCE requirements.md\nVoltage 5V'});
assert.ok(seenMessages[0].some(m => m.content.some(b => b.text?.includes('Voltage 5V'))));
assert.ok(!JSON.stringify(res.messages).includes('Voltage 5V'));
```

- [ ] Run tests red, then implement separate internally tagged text blocks, stripping tagged blocks from all returned histories in success/error/abort paths while retaining them during active tool/repair rounds. Add stable source-data/citation instruction. Keep model adapters unchanged unless necessary to honor existing text protocol.
- [ ] Implement compact file/folder inputs, file drop, selected document list, plaintext preview, remove/clear, errors/progress/cancel and included-character indicators using shared context budget. Inputs hidden but controls accessible. Only explicitly selected files enter context. Document list lifecycle generation prevents late import results after clear or board replacement. Avoid async extraction blocking the UI; imported errors leave successes intact.
- [ ] Integrate into composer and send: forward documentText, display source names/partial indicators in user turn without raw content, disable Send while importing and attachment mutations while model busy. Clear on New thread/board replacement; retain files on hide/settings changes. Do not store attachments in localStorage or document. Existing history persistence sees stripped sources. State text explains memory lifetime and chosen endpoint transmission. Use existing escaping/onPress/dialog styles; do not broadly refactor the large assistant panel.
- [ ] Run new and existing agent/provider/context tests and full `npm test` once. Commit/report exact tests and DOM selectors needed for Task3 browser acceptance.

## Task 3: Browser acceptance, documentation and complete review

**Files:** Modify `tests/e2e/smoke.mjs`, `README.md`; new focused browser test module under `tests/e2e/` if needed to keep new document tests cohesive, with exported `runDocumentChecks(harness)` documented injection interface; additional synthetic fixtures under Task1 fixture directory only as needed.

**Consumes:** Task1 file fixtures/parsers, Task2 controls/request propagation. **Produces:** verified user workflow with real browser parsing and provider payload inspection.

- [ ] Add smoke coverage for actual file and directory input selection, MD/TXT Unicode, real PDF/DOCX markers, partial inclusion, escaped hostile names/text in preview, selection/removal, skip/error handling, and New thread/reload/board-change cleanup. Use CDP DOM.setFileInputFiles or established harness equivalent with absolute synthetic fixture paths; do not replace parser functions or upload the user's files.
- [ ] Extend fake provider capture to inspect actual source content in current request across a tool round and absence after removal/reload. Assert board export/localStorage thread lacks raw source markers; preserve existing undo and RDK/reference/provider tests. Import alone must cause zero fake provider requests. Add meaningful cancellation/stale import and blocked storage coverage; run actual parsers without live AI credentials.
- [ ] Update README/THIRD_PARTY_NOTICES consistency: file/folder usage, formats, explicit OCR/.doc limits, tab lifetime, truncation/size budgets, dependencies bundled/lazy/local extraction. Describe that content goes to selected AI endpoint on Send. Capture screenshots to /tmp for controller visual inspection.
- [ ] Run `npm test` and `npm run e2e`, inspect failures and fix task-owned code. Report product issues outside ownership to controller for original implementer fixes. Commit/report test counts, browser errors, screenshot paths.
- [ ] Controller obtains full branch review, addresses material findings with regression coverage, verifies clean final work and integrates into main workspace. Publishing status stays explicit; only deploy when authorized.
