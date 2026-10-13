# Recovery and Engineering drafts implementation plan

Goal: preserve original startup data and retain unsaved Engineering form edits and focus.
Spec: ../../gap-review-2026-10-13.md, priorities 1 and 2. The user authorized continuing with these fixes.
Architecture: plain JavaScript, no new dependencies. A startup-recovery controller protects the existing autosave adapter. A shared form-draft helper stores only changed fields in memory, keyed by board scope, section and record. Existing explicit Save operations remain undoable document changes.

- [x] Recovery: add failing cases for malformed JSON, normalization warnings, full storage and cross-tab replacement. Implement src/startup-recovery.js with doc, list(), pending(), retry(), acknowledge(id), protect(storage), subscribe(fn). Keep immutable raw copies separate from rotating revisions; failed quarantine blocks autosave. Wire a persistent notice and raw export into Revisions. Preserve copies after acknowledgement and reload.
- [x] Drafts: reproduce switching sections/connections and saving with keyboard focus. Implement src/ui/form-drafts.js with capture(), mount(body, key), commit(form), per-form Discard, clear(), hasChanges(). Restore changed fields over freshly rendered saved values; exclude navigation selectors and file inputs. Handle report logos as validated form state. Save and Discard clear only their own draft.
- [x] Lifecycle: retain drafts on close/reopen and language changes, partition subsystem scopes, prevent leaking drafts into a replacement board, confirm deliberate abandonment, and retain draft values after validation failure. Make board replacement cancellation explicit to its callers.
- [x] Verification: run meaningful Node regressions and the focused browser reliability suite before and after; then run the full Node suite, source checks, main Chrome suite and relevant workflow/layout suites. Check Chinese copy coverage. Inspect the UI and update user recovery/draft documentation and the review's implementation status.

Review focus: no overwrite when raw-copy persistence fails; no stale form values restored after undo; no draft leakage across boards or subsystem scopes; no lost input from an asynchronous save; no focus falling outside an open modal after repaint.
