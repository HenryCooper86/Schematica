# Architecture change and review release — 2026-09-15

## Delivered

- Change-impact previews for part-number and voltage-rail edits, with direct and
  connected items, related requirements/decisions, power changes, and new findings.
  Applying a preview is one undo step; replacing a part clears stale declarations.
- Optional numeric interface limits and endpoint capabilities, including exposed
  subsystem ports. Checks distinguish declared conflicts from incomplete data.
  Negative/bipolar voltage ranges are valid; bandwidth must be positive.
- Standalone review tables for findings, interfaces, requirements, decisions,
  budgets, BOM, and baseline changes. Nested interfaces have scope-aware diagram
  focus, endpoint declarations, and an all-subsystem CSV export. Report format is 2.
- CI-gated Lightsail deployment using a restricted SSH key, exact revision checks,
  container tests, public health/application-hash checks, and retained-image rollback.
- Updated five-engineer study tasks and an unsent invitation template.

## Validation

| Check | Result |
| --- | --- |
| Node unit tests | 839 passed |
| Deployment gate/rollback tests (Python 3.14 locally) | 7 passed |
| Full Chrome regression | 209 passed |
| Final targeted Chrome engineering flows | 23 passed |
| Native Firefox workflows, reload, and presentation | 58 passed |
| Native Safari workflows, reload, and presentation | 58 passed |
| Restricted SSH command against existing live revision | Already deployed; healthy; served application hash matched |

The native browser runs preceded the final change allowing negative voltages.
The final unit and targeted Chrome runs include that change. GitHub CI reruns
unit, deployment, full Chrome, and presentation checks on the published commit.
Activation and failed-health rollback are tested with isolated mocks; no production
outage was deliberately induced. Successful release activation is verified live.

## Practical limits

Declared-data checks do not simulate electrical behavior. Impact traversal is a
conservative review scope. Evidence-presence counts do not authenticate evidence
or reviewer identity. Exported review reports currently use English.

Actual usability interviews remain pending named participants and an agreed
contact channel. See [the study kit](engineer-study-kit.md). Design alternatives,
KiCad reimport reconciliation, and incremental rendering remain future work.

See [engineering workflows](engineering-workflows.md) and
[deployment operations](lightsail-deployment.md) for usage and recovery.
