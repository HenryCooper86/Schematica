# Engineering workflows

Open **Engineering** in the toolbar. The editor remains local-first and requires
no account for these workflows. New board files use schema 4; schema 1, 2, and 3
files migrate automatically. Older application builds cannot preserve the new
engineering metadata: use this version when editing these files.

## Recovery and revisions

**Revisions → Save revision** stores a named snapshot of the entire architecture.
New/Open/Example and other board replacements first snapshot existing work.
Restore, export, or select a revision as a comparison baseline. Snapshots use IndexedDB with atomic insertion and retention in one transaction.
Existing localStorage revisions migrate after a successful database write. Retention is
bounded to 30 recent revisions and approximately 6 MiB of document text; a large
newest snapshot is retained. Browser quota failures are reported and the current
session retains its snapshot in memory. The canvas save status and revision list distinguish
durable saves from pending or failed writes; **Retry saving revisions** retries
recovery storage and autosave. Export important milestones.

If another tab writes the autosave, the editor retains both versions and pauses
its writes until **Keep this version** or **Open other version** is chosen.
This is conflict detection, not collaborative merging or a transactional lock
across processes. Unexpected browser termination and device failure still require
an exported backup.

## Interfaces

Select a connection under **Interfaces** and specify direction, voltage domain,
protocol version, rate/bandwidth, and a source reference. Direction also updates
wire arrowheads. Enable **Check required interface details** to flag missing
information without adding warnings to older boards by default. Text such as
“N/A — optical link” can explicitly document a non-applicable voltage domain.

**Export ICD CSV** produces stable, language-independent columns:

```text
id,from,to,bus,direction,voltage,protocol,rate,source
```

Directions are `from-to`, `to-from`, `bidirectional`, or empty. Endpoints display
part and port names. The importer requires matching connection IDs, endpoint
names, and bus type, validates every row before applying any changes, and updates
the matching specifications in one undo step. It does not create connections.
Export from the focused subsystem when reviewing its internal interfaces.
CSV follows quoted-cell escaping; spreadsheet formula-like cells are escaped.

## Requirements and decisions

Each record stores an ID, description, rationale, owner, evidence URL, status,
and allocations to parts/connections. Create and edit records in their respective
tabs. Multiple allocations use the multi-select list; current canvas selection
is the default for a new record. Requirement checks report unallocated records,
missing targets, and verified records without evidence. Evidence URLs are stored
as text; the application does not claim to verify their contents.

Copy/paste carries records allocated to copied objects and remaps references.
Identical records with the same ID merge allocations. Conflicting records get a
numeric ID suffix rather than overwriting a record on the destination board.
Duplicate adds references to the duplicated objects. Deleted targets stay visible
as missing so a broken requirement cannot silently become an unallocated success.

## Budget assumptions

The **Budget assumptions** tab adds per-part active/sleep currents and peaks,
active duty percentage, and converter input/output voltage and efficiency.
The board selects active, sleep, or duty-weighted-average mode. Peak scenarios
can sum all peaks or assume only one excursion above typical current at a time.
Average mode uses the higher declared active/sleep peak (or that state's typical
current when its peak is blank); duty percentage does not reduce peak demand.

Reference calculations covered by tests:

- 100 mA active, 1 mA asleep, active 10%: `100 × .1 + 1 × .9 = 10.9 mA`.
- 100 mA at 3.3 V from 12 V with 90% efficiency, plus 5 mA quiescent:
  `100 × 3.3 / 12 / .9 + 5 = 35.556 mA` upstream.
- Loads with typical/peak 100/200 mA and 20/50 mA: simultaneous peak is
  250 mA; one excursion at a time is `120 + max(100, 30) = 220 mA`.

Blank mode data remains unknown. A conversion requires all three conversion
parameters. Legacy boards retain their original 1:1 current accounting unless
explicit conversion data is supplied. Incomplete loads suppress runtime estimates.
Known totals remain visible. This does not model inrush, transient storage,
thermal effects, battery ageing, voltage cutoff, or actual peak correlations.

## Subsystems

Select unlocked parts, then **Subsystems → Group selected parts**. Internal
connections move into an embedded board; boundary connections terminate at
exposed ports. Open the subsystem for its editable expanded view, then **Return
to parent** to commit the child in one undo step. Existing parent undo history is
retained. Saving/autosaving while inside a subsystem preserves the complete root.

To expose another internal port, select the subsystem and internal port in this
tab, give it a name, and choose **Expose port**. This also supports ports without
an existing boundary connection.

Use ordinary copy/paste or Duplicate to reuse a subsystem. Internal IDs are scoped
to their own embedded document. Exposed port mappings and nested engineering
records travel with it. Eight nested levels and 64 exposed ports are supported.
Checks report broken exposed ports. Engineering analysis expands boundary mappings
so power budgets and BOM quantities retain the internal components. This is an
editable nested view, not simultaneous inline expansion of every child.

## Review packages and exceptions

Choose a saved revision as a baseline, then **Review package → Download review
package**. The standalone HTML file includes an offline board viewer and embedded
board JSON, ICD CSV, BOM CSV, and review JSON with findings, requirements,
decisions, budget assumptions, and comparison when a baseline is selected.
The report presents findings, interfaces, requirements, decisions, power budgets,
and BOM as readable tables. Its scope selector opens embedded subsystems; finding
and allocation buttons focus their diagram items. Internal interfaces and endpoint
limits appear alongside root interfaces. `interfaces-all.csv` adds scope and numeric
limits; `interfaces.csv` preserves the original focused-root column contract.
Requirements count as fully allocated only when all targets exist in that scope.
The current-verification count checks status, method, evidence, valid allocations,
and an unchanged verification fingerprint; it does not verify evidence contents. Exported reports currently use English.

A reviewed exception requires a reviewer and rationale. Findings remain in the
report; an exception is attached rather than deleting or suppressing it. It stops
applying when the relevant engineering fingerprint changes. This is a local review
record, not authenticated sign-off or a permission system. CLI checks continue to
fail on errors even if a reviewer has recorded an exception.

## Interchange and experimental KiCad import

Board JSON is the canonical lossless interchange format. Schema 3 adds optional
`engineering` (requirements, decisions, budget settings, exceptions), wire `spec`,
node `budget`, node `interfacePorts`, and node `subsystem` (embedded `doc` and exposed-port mappings).
Engineering records use `targets` containing stable item IDs.

BOM CSV retains the existing human-facing columns. For stable programmatic BOM
exchange, use `review.json` → `bom`: part/kind/part-number (`sublabel`), quantity,
references, addresses, rails, current in mA, statuses, flags, and notes. The review
format is versioned separately (`format: schematica-review`, `version: 2`).

The KiCad prototype imports **intermediate XML netlists**, not `.kicad_sch`, PCB
layout, SPICE, or arbitrary `.net` files. Components become custom parts and named
nets become junctions. Connections use untyped `link`; no protocol, direction,
voltage, or electrical compliance is guessed. Footprints remain in notes. Limits:
16 MiB input, 1,000 components, 2,000 nets, 64 connected pins per component. Unsupported
or inconsistent inputs fail instead of truncating the netlist. Duplicate references,
unknown endpoints, and a pin assigned to multiple nets are rejected.

This follows the documented XML `components/comp` and `nets/net/node` structure:
[KiCad's official netlist format documentation](https://github.com/KiCad/kicad-doc/blob/master/src/eeschema/eeschema_creating_customized_netlists_and_bom_files.adoc).
Synthetic multi-drop fixtures and browser XML parsing are tested. A real-team
fixture trial is still needed before claiming production interchange compatibility.


## Structured interface checks

Each connection may declare a minimum/maximum voltage in volts and required
bandwidth in **bits per second**. Each endpoint may declare direction, operating
voltage range, maximum bandwidth, supported protocol names, and a source reference.
An exposed subsystem port edits the declaration on its actual internal endpoint.
These declarations belong to the individual part instance and port.

- Both voltage bounds are needed for a range comparison. A declared connection
  range must fit both endpoint ranges. Without a connection range, a source range
  must fit its receiver's range; bidirectional ranges must fit in both directions.
- Protocol names match exactly, ignoring case. `I2C` and `I2C v7` are different
  declarations. The tool does not infer protocol revisions or negotiate a mode.
- Required connection bandwidth must not exceed either declared endpoint capacity.
- Direction checks use the connection arrow and endpoint input/output/bidirectional
  capability. Passive endpoints do not impose a direction restriction.
- Missing bounds, bandwidth, direction, protocol, or references produce an
  informational incomplete-compatibility finding after structured checks are opted
  into by supplying any numeric limit or endpoint declaration. Reversed ranges
  and nonpositive bandwidth are invalid; negative and bipolar voltage ranges
  are supported.

These are comparisons of declared operating limits, not signal-integrity, logic
threshold, absolute-maximum, timing, or protocol-conformance simulation. Textual
voltage/rate notes remain separate and are not parsed into numeric constraints.
Legacy ICD CSV edits preserve existing numeric data; use board JSON to transfer
all declarations losslessly.

## Change impact

**Change impact** previews a part-number or rail change. Direct changes seed a
review scope through connected parts, connections, and subsystem boundaries.
The preview lists related requirements/decisions, changes to calculated power,
and new or changed design findings. Layout-only changes do not seed this analysis.
Record edits and global budget assumptions also participate in baseline reviews.

**Apply previewed change** saves the displayed proposal in one undo step. A changed
board invalidates a pending preview. Replacing a part number clears its old current
fields, budget assumptions, and endpoint declarations. The existing part type and
ports are provisional; review them against the replacement's datasheet. Changing a
rail alone retains the part's declarations so incompatibilities remain visible.
The Properties editor and assistant part-number edits apply the same reset. An
assistant edit can supply fresh fields with the replacement; old fields are not
merged into them. Undo restores the previous declarations.

Connected items are a conservative review list, not proof of functional impact.
Requirement statuses and evidence are not automatically invalidated or approved.
To review a broader edit, save a revision first, make the changes, then use that
revision as the baseline in **Review package**.


## AI change previews

The assistant defaults to **Preview changes before applying**. It runs tools on
an isolated draft, then shows changed fields, affected interfaces and records,
and design checks before and after. **Apply changes** commits the draft in one
undo step; **Discard draft** leaves the board unchanged. A stale draft cannot
replace a board edited or opened after the request started. Cancelled or failed
requests discard their draft. Read-only replies need no approval. Uncheck the
preview option to use the existing direct-edit behavior for that session.

## Saved views

Set Explore filters, select items, choose the reading detail and camera, then
open **Engineering → Saved views → Save current view**. A view records the current
subsystem path and returns to the root to save it. Open a view to return to that
scope and restore its filters, selection, detail and camera. Missing subsystems
are reported rather than substituted. Views travel in board JSON and share links;
review packages include a saved-view selector for the offline diagram. A view
contains references, not a separate copy of the design. Up to 100 are supported.

## Revision comments

**Review comments → Start revision review** creates a named snapshot and a local
review record tied to its ID and design fingerprint. Add comments against parts,
connections, or requirements; resolve or reopen them. Open comments prevent
approval. Editing the design marks approval stale, while adding review metadata
or saved views does not. A new review is needed for a changed revision.

Export/import `review-comments.json` to exchange discussions asynchronously.
Subsystem paths are retained, missing scopes reject the import, and conflicting
versions are kept separately rather than overwriting local decisions. The file
contains comments and revision references, so exchange the corresponding board
or review package too. Reviewer names and decisions are local records, not
identity-verified signatures or server permissions. Recent revision snapshots
remain subject to recovery retention; export important review milestones.

## Verification matrix

Requirements now include a verification method. Saving a requirement as verified
requires a method, evidence reference, and valid allocations; this records the
current allocated design and adjacent interfaces. **Verification matrix** filters
by ID, text, owner or scope, and can show only records needing attention. Changes
to allocations or connected interface declarations mark evidence for re-review;
cosmetic movement does not. Choose a revision baseline to see changed requirements.
The matrix exports CSV and is included in review packages. Old verified records
without a verification stamp need review; evidence contents are not independently
validated by the application.

## First project

The palette's **First project** button opens five actionable steps: place parts,
connect ports, declare interface details, inspect checks, and export a review.
It can guide work on an existing board or load the Sensor Node example. Loading
a starter first requires a durable recovery snapshot of existing work. Completed
checks and export steps become incomplete again if the design changes. Progress
is session-local; the actual board and engineering data use normal persistence.

## Subsystem power semantics

Each scope owns its operating mode and peak assumption. A scope with no explicit
settings uses Active and simultaneous peaks. Grouping copies its parent settings;
subsequent child changes are independent. Root power, BOM, checks and review
reports evaluate those child settings. Noncoincident peaks are combined within a
scope; independent scope excursions on a shared rail are summed. This remains
arithmetic on declared loads, not electrical or transient simulation.
