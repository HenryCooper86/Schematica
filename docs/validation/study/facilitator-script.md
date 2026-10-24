# Facilitator script

For one 45-minute session with one participant and one recipient. Control
names are those of the current release; the rehearsal in
[dry-run-2026-10-24.md](dry-run-2026-10-24.md) confirmed each step.
Timings in brackets are budgets, not targets to announce.

## Consent (read aloud, before anything else)

> This session tests the software, not you. We will time four tasks, count
> the questions you ask and note where you hesitate. The notes use a
> pseudonym and will be kept outside the code repository. You can stop at
> any time. May we proceed? May we record the call?

Write the answers on the observation sheet. Stop here if the answer is no.

## Setup (not timed, 3 minutes)

1. Fresh browser profile. Open the site. If a board is already there, choose
   **Save** so it is kept, then continue; the study board replaces it.
2. Choose **Open** in the toolbar and pick `seeded-review-board.schematica.json`.
   Confirm the title reads *Study board: serial telemetry chain (seeded)* and
   five cards are visible.
3. Say: "This is a five-stage serial telemetry chain with declared
   interfaces and three requirements. Some of it is wrong. Your job is to
   find out what, fix it, and hand the result to a colleague."

## Context (5 minutes, not timed)

Ask and note: team size; what a hand-off looks like today; current toolchain;
the most costly recurring architecture mistake; laptop and browser.

## The four tasks

The evaluator scores four tasks: create, review, recover and handoff. Review
includes the repairs. Run them in Schematica and in the participant's own
tool, in the order the tracker gives for this participant. In the baseline tool, describe the same
seeded issues in words (the answer key has the wording) and let the
participant use whatever they would normally use. Start the stopwatch when
you finish reading the task; stop it when the participant says they are
done or gives up. Giving up is a completed observation with `completed:
false`.

### Task 0 — create (budget 10 minutes, on a new board)

> Draw a small sensor subsystem: a controller, one sensor and its power
> path. Declare the sensor bus, give one interface a source reference and a
> current assumption, and allocate one requirement to it.

Expected route: drag **MCU**, **Temp sensor** and **Regulator** from the
palette, wire them; **Engineering → Interfaces** for the source line;
**Engineering → Budget assumptions** or the card's current fields;
**Engineering → Requirements → New record** allocated to the sensor wire.
Then **Save** that board and **Open** the seeded board for the next task.
Count it complete when all four declared items exist, however they got there.

### Task 1 — review, including the repairs (budget 15 minutes)

Time the two parts together as the evaluator's `review` observation; note
the split on the sheet if you can.

> Find everything that is wrong with this design as declared.

Expected route: **Check** in the toolbar. The dialog lists three errors and
one warning (answer key). Count a seeded issue as found only when the
participant names the connection or requirement and the kind of problem.
Note any issue they name that is not seeded.

Scripted help, only if asked: first ask "where would you look for a check?";
only on a second request say "the Check button in the toolbar".

#### Then, without stopping the clock:

> Fix the three interface problems from the declared sources on the cards,
> and make the requirement finding go away without lowering the bar.

Expected route: **Engineering → Interfaces**, pick the connection, edit the
*To endpoint capabilities* section, **Save interface**; then **Engineering →
Requirements**, pick REQ-2, add a verification method and evidence, save.
Accepted values are in the answer key. Marking REQ-2 as draft also removes
the warning but lowers the bar: note it as a missed assumption, not a fail.

Watch for: the voltage repair needs both bounds; the protocol repair is a
name, not a version number; REQ-2 needs a method as well as evidence (the
toast says so). Each of these is a usability observation if it costs time.

### Task 2 — recover (budget 5 minutes)

> Get back the board exactly as it was before your repairs, then return to
> your repaired version.

Expected route: **Engineering → Revisions**. If the participant did not name
a revision before repairing, the automatic recovery snapshot and Undo are
both acceptable. Count it as completed when Check shows the four findings
again and then shows none again.

### Task 3 — handoff (budget 7 minutes)

> Give a colleague something they can review without this tool, including
> what changed.

Expected route: **Engineering → Revisions → Use as baseline** on the
pre-repair revision, then **Review package → Download review package**. The
file is `architecture-review.html`. Hand it to the recipient with
[recipient-quiz.md](recipient-quiz.md). The recipient's time and their
answers are part of this task's observation; the participant may not help.

## Debrief (10 minutes, not timed)

Ask, in this order, and write the answers down verbatim where you can:

1. What would make this usable tomorrow?
2. What would stop your team adopting it?
3. Which next feature would replace work you do today rather than add upkeep?
4. Did you at any point believe the tool had tested the electrical
   behaviour? (If yes, record it as a usability finding: the checks compare
   declarations only.)
5. Collaboration: who changed your last real review, who reviewed it, what
   counted as approval, where were decisions lost?

## Close

Thank the participant. Delete the study board from their browser if they
want (choose **Open** on their saved board, or clear the site data). Fill in
the observation sheet before the next session.
