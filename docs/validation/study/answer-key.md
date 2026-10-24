# Answer key — seeded review board

Facilitator only. The board is the declared UART reference with four issues
planted. Every value is a teaching assumption, not a device rating.

## Seeded issues

| # | Where | What was planted | Check prints | Accepted repair |
| --- | --- | --- | --- | --- |
| 1 | Connection **w2**, Protocol bridge → Message router | The router's receiving port (*UART A*) declares 9,600 bit/s; the connection requires 115,200 bit/s. Its source line says "limited to 9600 bit/s in low-power mode". | `ERROR Interface w2: Required bandwidth exceeds endpoint 2 capacity.` | *To endpoint capabilities* → Bandwidth `115200`. Lowering the connection to 9,600 instead is a design change, not a repair; note it and ask why. |
| 2 | Connection **w3**, Message router → Data logger | The logger's receiving port declares a 1.7–1.9 V range; the connection is 3.0–3.6 V. | `ERROR Interface w3: The connection voltage range exceeds endpoint 2 limits.` | *To endpoint capabilities* → Minimum voltage `3`, Maximum voltage `3.6`. Both bounds are needed. Adding a level shifter is a valid design answer in the baseline tool; in Schematica count it as completed if they explain it. |
| 3 | Connection **w4**, Data logger → Test terminal | The terminal's receiving port lists the protocol `UART v2 framed`; the connection declares `UART`. Names must match exactly. | `ERROR Interface w4: The protocol is not supported by endpoint 2.` | *To endpoint capabilities* → Supported protocols `UART`. Changing the connection's protocol to the vendor name is also accepted if the participant says the other endpoints must then agree. |
| 4 | Requirement **REQ-2** | Status *verified* with no evidence and no method. | `WARNING Verified requirement REQ-2 has no evidence.` | **Requirements → REQ-2** → Method and Evidence filled, status stays *verified*. Setting status to *draft* clears the warning but is a missed assumption. |

Everything else is clean: w1 is fully declared and correct, REQ-1 is verified
with evidence and a method, REQ-3 is a draft allocated to the terminal.

## Baseline-tool wording

When the tasks run in the participant's own tool, describe the same board
and planted issues in words, without naming the error:

> Five modules in a chain over UART at 115,200 bit/s on 3.0–3.6 V logic.
> The router datasheet excerpt says its UART A is limited to 9,600 bit/s in
> low-power mode. The logger excerpt says UART A is a 1.8 V I/O domain. The
> terminal manual says it accepts the vendor "UART v2 framed" variant only.
> Requirement REQ-2, "all links within 3.0–3.6 V", is marked verified with
> no evidence attached.

## Recipient quiz answers

1. **Direction of w1:** bidirectional (arrow both ways; the package's interface table says so).
2. **Which connections changed since the baseline:** w2, w3 and w4's receiving endpoints (Message router, Data logger, Test terminal appear as direct changes).
3. **Evidence for REQ-1:** `bench-log-2026-09-30.txt (illustrative)`; method *Bench test (illustrative)*.
4. **Which requirement is still a draft:** REQ-3, allocated to the test terminal.
5. **What the checks do not prove:** electrical behaviour, timing, signal integrity; the package states the checks compare declared data only.
6. **Where the 115,200 bit/s figure comes from:** the illustrative interface contract UART-REF-1 quoted in each source line; a teaching assumption, not a measured rating.

Count the quiz as passed when answers 1, 2 and 5 are right without help;
the others are recorded but do not gate the task.
