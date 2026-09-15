# Code validation — 15 September 2026

## Scope and findings

Reviewed Engineering analysis, power calculations, part changes, document state,
revision handling, and assistant edit operations. The initial 839 unit tests and
209 Chrome checks passed, but targeted review exposed three additional defects:

1. Root-level design checks lost a nested subsystem's required-interface policy.
   Analysis now carries that policy with scoped wires, including deeper children,
   without duplicating findings.
2. Duty-weighted power estimates ignored sleep-state peaks above the active peak.
   Peak demand now includes both states; the typical current remains weighted.
3. Ordinary and assistant part-number edits could retain the old part's ratings.
   They now share the Engineering preview's reset policy. Explicit fresh values
   are accepted, unchanged part numbers retain data, and undo restores old data.
   Assistant type replacements also clear budget and endpoint declarations.

Six regression tests cover these cases, nested inheritance, fresh replacement
data, undo, and failed atomic edit batches. The first three reproduced the defects
before the fixes.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 845 passed |
| Chrome full suite with KiCad manifest | 225 passed |
| Firefox native browser suite | 58 passed |
| Safari native browser suite | 58 passed |
| Python deployment gate and rollback suite | 7 passed |
| `git diff --check` | Passed |

The Chrome run includes four official KiCad example projects and checks imported
connectivity against independently exported netlists. Browser runs reported no
captured console errors or unhandled exceptions. Native browser suites cover a
targeted subset of Chrome's workflows; see [local validation](local-validation.md).

These results cover the automated scenarios and reviewed code paths. They do not
establish that every possible board or workflow is bug-free. No new human usability
study or live paid-provider acceptance run was performed in this pass.

## Publication

At validation time, GitHub CI and Pages jobs for the preceding visual update were
still queued. The last confirmed public release was `2af1808`. Local test success
does not establish deployment: Lightsail requires successful GitHub CI before
activation, and both public sites need verification after publishing completes.
