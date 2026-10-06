# Collecting product evidence

These tools collect and summarize observations. No participant, provider, or
physical-device results are supplied with the templates.

## Engineer pilot

Copy `study-results.template.json` outside the repository. Populate `participants`
with consented, pseudonymous observations; keep identifying information and private
project files out of version control. Each participant has this shape:

```json
{
  "id": "anonymous-session-id",
  "consented": true,
  "date": "YYYY-MM-DD",
  "device": "CPU, memory and display",
  "browser": "Browser and full version",
  "baselineTool": "Participant's current tool",
  "taskOrder": "baseline-first",
  "observations": []
}
```

For each of `create`, `review`, `recover`, `handoff`, record one observation in
`baseline` and one in `schematica`:

```json
{
  "task": "review",
  "tool": "schematica",
  "seconds": 1,
  "completed": false,
  "helpRequests": 0,
  "missedCritical": 0,
  "dataLoss": false,
  "evidence": "Path to consented session notes"
}
```

The numeric values above illustrate the schema only. Replace every value with
observations. Alternate `baseline-first` and `schematica-first` ordering across
sessions to expose learning effects. Use the same task complexity and seeded
interface conflict; record all failures and help. Follow the existing
[study kit](../engineer-study-kit.md) for the session tasks and debrief.

```sh
node scripts/evaluate-evidence.mjs /path/to/actual-study-results.json
```

The summary uses each participant's paired review-plus-handoff improvement, then
reports its median. The proposed pilot target requires at least five complete
participants, at least 20% median improvement, no missed critical seeded finding
and no observed data loss in Schematica. All four tasks must be completed in both tools. Incomplete baseline tasks produce
`needs-data` and no aggregate improvement; abandoned durations are not comparable
completion times.
Help counts remain visible. It is an exploratory threshold, not statistical proof
of category leadership. Source notes are references, not automatically verified.

## Assistant evaluation

Use every task and criterion in `assistant-cases.json` in an isolated board with
actual provider/model versions recorded. Copy `assistant-results.template.json`,
fill provider/model/date, and record each case once:

```json
{
  "id": "rate-conflict",
  "evidence": "Path to redacted output and evaluator notes",
  "passed": false,
  "unsupportedVerifiedClaim": false,
  "corrections": 0,
  "seconds": 1
}
```

A case passes only if all its rubric criteria pass. Unsupported engineering claims
marked verified block success even when an evaluator marked the case passed.
Include canceled/failed requests and corrections. Never include API keys, private
source content without permission, or credentials in evidence files.

```sh
node scripts/evaluate-evidence.mjs /path/to/actual-assistant-results.json
```

Exit codes for both summaries: `0` recorded targets met; `1` targets not met;
`2` incomplete/invalid data or usage. An empty study cannot pass. This utility does
not contact participants or make provider calls; the existing `npm run acceptance`
runner can assist a separately configured provider session.

## Performance

```sh
npm run benchmark -- .acceptance/benchmark-device.json
```

Run without other test suites on the same machine. The benchmark records browser,
reported hardware, three warmups, and 30 measured samples per operation at
100/500/1,000 nodes. It reports median/P95/min/max, DOM count and available heap
samples. `scheduledFrame` measures a programmatic edit through two animation
frames; it is a scheduling proxy and must not be described as native input-to-paint
latency. Existing synchronous metrics exclude event transport and actual display.
Heap observations are not a memory-leak proof. Repeat on representative physical
laptops and realistic custom-part designs before setting supported-device promises.

## Live release verification

After a committed release is deployed:

```sh
node scripts/verify-release.mjs https://henrycooper86.github.io/Schematica/ --pages
node scripts/verify-release.mjs https://bionicloud.net/ --health
```

The tool checks the Pages commit marker or production health plus SHA-256 hashes
of selected served assets against the current Git **commit**, excluding uncommitted
working-tree edits. It exits `1` for a failed check and `2` for invalid usage.
Failures include HTTP errors, redirects, timeouts and stale file content. This is
a point-in-time verification command, not an uptime monitor or a full browser run.
An operator can use its JSON output in their existing monitoring system.

## Recovery drill

Use an isolated recovery host with the same deployment runtime. Do not tear down
production to test recovery. Record drill date/operator, intended revision,
backup age, recovery start/end, recovered resources and every failed check.

1. Inventory the active/previous release hashes, Caddy volumes, environment and
   (if enabled) team-review data and identity configuration. Keep secrets out of
   the report; encrypted backups and restore keys belong in operator storage.
2. Restore into the isolated host. Keep its team identity configuration separate
   from production; test with dedicated identities. Never expose backed-up data
   through the static asset directory.
3. Start the retained image/configuration. Verify container health, HTTPS and
   committed asset hashes. For shared reviews, verify membership, revision history,
   comment attribution and denial for a revoked test identity.
4. Exercise a failed activation and rollback on that isolated host. Check that
   the previous healthy revision and persistent reviews remain available.
5. Record observed recovery time and data-loss interval. Choose recovery targets
   from team needs, then repeat until measured results meet those targets.

No restore drill has been conducted merely by adding this procedure. Do not
claim an RTO/RPO or availability percentage without measured evidence.
