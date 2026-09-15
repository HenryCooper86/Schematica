# Engineering workflows

Open **Engineering** in the toolbar. The editor remains local-first and requires
no account for these workflows. New board files use schema 3; schema 1 and 2
files migrate automatically. Older application builds cannot preserve the new
engineering metadata: use this version when editing these files.

## Recovery and revisions

**Revisions → Save revision** stores a named snapshot of the entire architecture.
New/Open/Example and other board replacements first snapshot existing work.
Restore, export, or select a revision as a comparison baseline. Snapshots use
independent keys to avoid a shared-index overwrite between tabs. Retention is
bounded to 30 recent revisions and approximately 6 MiB of document text; a large
newest snapshot is retained. Browser quota failures are reported and the current
session retains its snapshot in memory. Export important milestones.

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
The full nested architecture remains in the embedded board file. Review internal
ICDs by opening/exporting their subsystem in the editor.

A reviewed exception requires a reviewer and rationale. Findings remain in the
report; an exception is attached rather than deleting or suppressing it. It stops
applying when the relevant engineering fingerprint changes. This is a local review
record, not authenticated sign-off or a permission system. CLI checks continue to
fail on errors even if a reviewer has recorded an exception.

## Interchange and experimental KiCad import

Board JSON is the canonical lossless interchange format. Schema 3 adds optional
`engineering` (requirements, decisions, budget settings, exceptions), wire `spec`,
node `budget`, and node `subsystem` (embedded `doc` and exposed-port mappings).
Engineering records use `targets` containing stable item IDs.

BOM CSV retains the existing human-facing columns. For stable programmatic BOM
exchange, use `review.json` → `bom`: part/kind/part-number (`sublabel`), quantity,
references, addresses, rails, current in mA, statuses, flags, and notes. The review
format is versioned separately (`format: schematica-review`, `version: 1`).

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
