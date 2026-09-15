# Embedded architect validation kit

This kit is ready for five practicing embedded/system architects. No interviews
or outreach have been conducted, and no participant data has been invented.

## Recruitment brief

Seek engineers who own interfaces across hardware and firmware, including one
power-constrained device engineer, one robotics/vehicle architect, and one review
or integration lead. Use their own representative workflow where permissions allow.
Ask them to bring an anonymized board/interface table or KiCad XML netlist.

## 45-minute session

1. Context (5 minutes): team size, handoff artifacts, current toolchain, most costly
   recurring architecture mistake, preferred laptop/browser.
2. Create a sensor subsystem (10 minutes): MCU, sensor, power path; explicit bus,
   source reference, current assumptions, and a requirement allocation.
3. Review a revision (10 minutes): find a changed interface and an incomplete load;
   record a justified exception; compare against the baseline.
4. Handoff (10 minutes): export the review package; have a colleague identify the
   interface direction, requirement evidence, and budget assumptions without help.
5. Debrief (10 minutes): what would make this usable tomorrow? What would prevent
   adoption? Which next feature would replace actual work rather than add upkeep?

## Scorecard

Record task completion, elapsed time, help requests, missed assumptions, and
recipient questions. Compare with the participant's current workflow. Log each
finding with reproduction steps and severity; do not average away a data-loss
or incorrect-engineering result. Repeat with the same tasks after fixing P1 issues.

| Participant | Create time | Review time | Handoff time | Help requests | Missed assumptions | Recipient questions | Adoption blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

## Collaboration discovery

Ask for the most recent real review: who changed it, who reviewed it, what counted
as approval, and where decisions were lost. Rank comments, revision ownership,
reviewer sign-off, permissions, and live simultaneous editing by actual frequency
and consequence. Request an example for each claimed need. Do not build accounts
or live multiplayer merely because participants say they sound useful.

## Release evidence

A pilot is ready when every participant can recover a previous board and complete
a handoff, no high-severity correctness issue remains open, and the improvement
is visible in measured tasks. These are proposed pilot criteria, not results.
Keep real-team fixture compatibility and target-device performance as explicit
release gates. Recruit/contact participants only through an agreed channel with
identified recipients; this document itself does not send invitations.


## Next session: interface changes and review handoff

Use the new release for the following measured tasks within the existing session:

1. Declare a 3.0–3.6 V, 400,000 bit/s I2C connection and its two endpoint limits.
   Lower one endpoint to 100,000 bit/s. Ask the participant to explain the finding.
2. Preview a replacement part and identify the directly changed item, connected
   items, and requirements that need review. Apply, undo, and verify recovery.
3. Export a report containing a subsystem. Ask the recipient to find an internal
   interface, open its diagram, and distinguish missing declarations from errors.

Record whether each participant understands the limits of declared-data checks,
conservative change scope, and evidence-presence counts without prompting. Treat
misinterpreting these as electrical validation as a usability finding.

### Invitation template (not sent)

> We're testing Schematica with practicing embedded and system architects. Would
> you join a 45-minute session to create a small architecture, review a part/interface
> change, and hand off a report? Please bring an anonymized example if permitted.
> We will record task timing and usability notes; recording a call is optional and
> requires your agreement. Please suggest a time and your preferred meeting channel.

Scheduling remains pending until five participants and a contact channel are
identified. Automated browser tests do not substitute for participant results.
