# Five-engineer adoption study — materials

Everything the facilitator needs to run the study described in the
[engineer study kit](../../engineer-study-kit.md) on the current release.
No participant has been recruited and no observation has been recorded;
nothing in this folder is a result.

| File | Use |
| --- | --- |
| [facilitator-script.md](facilitator-script.md) | Minute-by-minute session script with the exact control names, stopwatch rules and scripted help |
| [seeded-review-board.schematica.json](seeded-review-board.schematica.json) | The board every participant reviews: four planted issues, described in the answer key |
| [repaired-reference-board.schematica.json](repaired-reference-board.schematica.json) | What the board looks like after all four repairs; the facilitator's reference, never shown before the debrief |
| [answer-key.md](answer-key.md) | Each seeded issue, the finding text Check prints, the accepted repair, and the recipient-quiz answers |
| [recipient-quiz.md](recipient-quiz.md) | Six questions for the colleague who receives the review package, without answers |
| [observation-sheet.md](observation-sheet.md) | What to write down during a session, in the order it happens |
| [study-session.template.json](study-session.template.json) | One participant's record, ready to paste into the results file the evaluator reads |
| [dry-run-2026-10-24.md](dry-run-2026-10-24.md) | The scripted rehearsal of the four tasks on this release, with screenshots |

## Before the first session

1. **Participants.** Five practising embedded or system architects, per the
   kit's recruitment brief: at least one power-constrained device engineer,
   one robotics or vehicle architect and one review or integration lead.
   Track them in the table below. Invitations go only through a channel the
   team has agreed; the template in the kit is not sent by this repository.
2. **Consent.** Read the consent text in the facilitator script aloud and
   record the answer before the stopwatch starts. Call recording is optional
   and separate.
3. **Baseline tool.** Ask each participant in advance which tool they use
   today for the same work (spreadsheet, Visio, KiCad notes, a wiki, ...) and
   have it available on their own machine. The baseline tasks run in that
   tool with the same seeded issues described in words.
4. **Task order.** Alternate `baseline-first` and `schematica-first` across
   participants: 1 baseline-first, 2 schematica-first, 3 baseline-first, 4
   schematica-first, 5 baseline-first.
5. **Machine.** The participant's own laptop and browser if possible. Open
   the production site or the static edition in a fresh browser profile so no
   earlier board is autosaved there. Record device and browser version.
6. **Rehearse.** Run `STUDY_E2E_ONLY=1 node tests/e2e/smoke.mjs` on the
   release you will use. It loads the seeded board, confirms the four
   findings, repairs them, recovers a revision and downloads the package.
   If it fails, the materials no longer match the release: fix that first.
7. **Recipient.** Each session needs a second person to receive the review
   package and answer the recipient quiz without help. They must not have
   seen the board. The facilitator can play this role only if they did not
   watch the repairs.

## Participant tracker (fill in; keep names out of version control)

| Slot | Role sought | Pseudonymous id | Consented | Date | Task order | Baseline tool | Recipient |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Power-constrained device engineer | | | | baseline-first | | |
| 2 | Robotics / vehicle architect | | | | schematica-first | | |
| 3 | Review / integration lead | | | | baseline-first | | |
| 4 | Any | | | | schematica-first | | |
| 5 | Any | | | | baseline-first | | |

## After each session

Copy the observation sheet's numbers into a participant record made from
[study-session.template.json](study-session.template.json), append it to a
results file kept outside the repository, and run:

```sh
node scripts/evaluate-evidence.mjs /path/to/study-results.json
```

The evaluator reports `needs-data` until five complete participants exist.
Record every help request and every failure; do not average away a data
loss or a missed seeded issue.
