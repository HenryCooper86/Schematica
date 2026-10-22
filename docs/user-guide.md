# Schematica user guide

[Documentation home](README.md) · [Getting started](getting-started.md) · [Troubleshooting](troubleshooting.md)

Use this guide when you know what you want to do. Start with the
[first-review tutorial](getting-started.md) if you have not used Schematica before.
The instructions use English button names. Toolbar icons show their names on hover.

## Contents

- [Build and edit a board](#build-and-edit-a-board)
- [Review the design](#review-the-design)
- [Save and recover](#save-and-recover)
- [Share and export](#share-and-export)
- [Compare and import](#compare-and-import)
- [Use the assistant](#use-the-assistant)
- [Explain CVEs and PoCs](#security-analysis)
- [Present your board](#present-your-board)
- [Review with a team](#review-with-a-team)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Glossary](#glossary)

## Build and edit a board

### Make a small controller-and-sensor sketch

1. Save any current work, choose **New** in the toolbar and confirm.
2. Enter a title such as `Temperature monitor` in the top-left title field.
3. Search the left palette for `MCU`. Click or drag the part onto the canvas.
4. Search for `Temp sensor` and add it beside the controller.
5. Select each card to edit its label and other properties in the right panel.
   Enter part numbers and voltage rails only when you know them.
6. Hover over the cards to reveal their ports. Drag from the MCU's I2C port to
   the sensor's I2C port. A wire should join the two ports.
7. Press **F** to fit the diagram and **Ctrl/Cmd+S** to save it.

This is an architecture sketch, not a completed circuit. Power, ground and
interface declarations still need attention. Add the actual supplies and return
paths appropriate to your design; use **Check** to identify incomplete work.

### Connect ports using the keyboard

Choose **Connect ports** in the left palette. Select **From part**, **From port**,
**To part**, **To port** and, when offered, **Bus type**. Press **Ctrl+Enter** or
**Cmd+Enter**, or choose **Create connection**. Escape cancels and returns focus
to the opening control. A successful connection is one undo step.

The form excludes locked parts. Unlock a part first if it is missing from the
list. A matching bus name describes the connection type; it does not establish
that the endpoints are electrically compatible.

### Change a connection

Select the wire to edit its bus, label, arrowheads, line style or traffic flow
in Properties. To reconnect an endpoint, drag its selected end handle to another
port. Use **Engineering → Interfaces** for the connection's requirements and the
capabilities of both endpoints.

### Organize the drawing

Drag cards to move them. Shift-click to select several, then use the **Align**
controls in Properties. **Z** draws a zone around related items; **N** adds a
note. Locks prevent movement and deletion, but do not freeze every property.
Use **K** to lock or unlock the selection.

For a larger board, **Explore** or **/** searches placed parts. Filter by bus or
choose a reading-detail level to focus the view. These filters do not remove
parts. **Reset exploration** restores the view. Save a useful viewpoint through
**Engineering → Saved views → Save current view**.

For a reusable component, choose **+ New** under **My parts**, define its ports
and save it. Custom definitions travel with a saved board. Export the My parts
library separately when moving your template collection to another browser.
See the [editor reference](editor-reference.md) for alignment, clipboard,
custom-part and subsystem-related controls.

## Review the design

### Check drawings and interface declarations

Choose **Check** in the toolbar. Inspect its findings, then select an affected
item to locate it. **Layout quality** concerns readability; **Power** lists rail
estimates; **Review readiness** shows the coverage of applicable connections.

| Interface status | Meaning | Next action |
| --- | --- | --- |
| Checked | The supplied declarations pass the applicable comparisons | Confirm the declarations and their sources match your actual design |
| Failed | Supplied declarations conflict | Inspect the finding and change the design or a supported declaration |
| Unassessed | Information needed for assessment is missing | Add the missing declarations, leaving genuinely unknown values blank |
| Not applicable | This connection is excluded from interface assessment, such as a flow link | Review its intended meaning separately |

Open **Engineering → Interfaces** and select a connection. Record direction,
voltage, protocol, bandwidth and source references as applicable. The form
separates **Connection limits** from **From endpoint capabilities** and
**To endpoint capabilities**. Numeric voltage fields use volts; numeric bandwidth
fields use bits per second. Text notes such as `3.3V` are separate from numeric
limits and do not fill them automatically.

Use **Guided interface completion** to find missing fields. Choose **Save
interface** before advancing to **Next connection needing review**. Re-run checks
after making changes. Power and ground do not need protocol/rate declarations;
flow and relationship links are excluded from interface coverage.

**Ready for interface review** describes declared coverage and findings. It is
not a statement that a board has been built, tested or electrically certified.
See [engineering rules and limits](engineering-workflows.md#structured-interface-checks).

### Add requirements and evidence

Select the relevant parts or wires, then open **Engineering → Requirements**.
Give the requirement an ID, description and owner, and allocate it to the items
it concerns. Record the verification method and evidence when available.

Use **Verification matrix** to find missing allocations or evidence needing
review. A verified requirement needs a method, evidence reference and valid
allocations. Later changes to the allocated design can make that evidence stale.
Recording an evidence reference does not cause Schematica to inspect its contents.

Use **Decisions** to record the reason for an architecture choice. Before a major
change, save a named revision so you have a meaningful comparison baseline.

### Estimate power

Enter known current, capacity and supply-limit fields in Properties. Use
**Engineering → Budget assumptions** for duty cycles, active/sleep loads and
converter assumptions. Inspect the **Power** tab in Check.

A missing load is not zero. Incomplete downstream loads prevent a complete
battery-runtime estimate. These are calculations from declared values;
[the power reference](editor-reference.md#power-estimates) explains their limits.

## Save and recover

| Method | What it keeps | When to use it |
| --- | --- | --- |
| Browser autosave | The working board for this site in this browser | Continue after a normal reload |
| **Save** / **Ctrl/Cmd+S** | An editable `.schematica.json` download | Keep a portable backup or move to another computer |
| **Engineering → Revisions → Save revision** | A named snapshot in this browser's recovery storage | Mark a milestone before experimenting |
| Revision **Export** | A file copy of that snapshot | Retain an important milestone outside browser storage |

Use **Open** to load a board file. Opening a board replaces the current canvas;
save current work first. Autosave is not an account or a cloud-sync service.
The production site, GitHub Pages and localhost each have separate browser storage.

In **Engineering → Revisions**, enter a revision name, choose **Save revision**
and wait for **Saved on this device**. Use **Restore** to return to that snapshot.
The store retains up to 30 recent revisions with a bounded storage budget, so
export milestones you need to keep indefinitely.

If startup finds unreadable or repaired autosave data, **Recovery needs review**
opens the original data and repair warnings in Revisions. **Export original data**
downloads the exact original contents, even when they cannot be opened as a board.
These copies are separate from the rotating revision history. **Mark reviewed**
clears the notice and keeps the copy. If the original cannot be preserved,
autosave pauses; export the current board and original data, then try
**Retry preserving original data** after resolving the storage problem.

Engineering forms retain unsaved field edits when you change sections or records,
close and reopen the dialog, or change language. The **Unsaved draft** notice
and **Discard draft** action belong to that form. Use its Save action to commit
the edits to the board; committed edits remain undoable. Report details are
committed by **Save and preview report**. Drafts live only in the current tab,
so save them before reloading or closing the page. Opening another board asks
before discarding drafts. Cancelling leaves the current board and drafts intact.

If another tab changes the autosave, Schematica asks you to choose **Keep this
version** or **Open other version**. Resolve the conflict before continuing;
it does not merge both drawings automatically. If storage fails, download a board
file and follow [saving and recovery troubleshooting](troubleshooting.md#saving-and-recovery).

## Share and export

Choose the format for the recipient's task:

| Recipient needs to… | Use | Result |
| --- | --- | --- |
| Continue editing | **Save** | `.schematica.json` board file |
| Open a copy quickly | **Share** | A URL containing the board; later edits are not synchronized |
| Read the diagram interactively offline | **Export → Interactive HTML** | One HTML file with exploration and presentation controls |
| Give a client or manager a technical deliverable | **Engineering → Technical report** | Branded report with project context, diagrams, selected engineering sections, and HTML or PDF export |
| Review findings, interfaces, requirements and changes | **Engineering → Review package → Download review package** | An HTML report with embedded design data and downloads |
| Insert a picture into a document | **Export → PNG**, **Copy PNG** or **SVG** | Raster or vector artwork |
| Print a static diagram | **Export → PDF** | A single-page PDF |
| Inspect the parts list | **BOM** | Grouped bill of materials with CSV/Markdown options |
| Watch a tour | **Rec**, or **Export → Loop GIF** for a short animation | A recording or animated image |

For a client report, enter the project context and document details, choose the
sections, and use **Save and preview report**. HTML opens independently offline.
PDF opens the browser print dialog; choose **Save as PDF** and all pages. Preview
again after changing the project or report details. See
[client technical reports](engineering-workflows.md#client-technical-reports).

A share link carries the board's content: give it only to people who should see
that content. It is not an access-controlled team workspace. Opening one loads
the shared board and offers recovery of the previous board when a backup is kept.
Save an important board before switching.

**Interactive HTML** emphasizes exploration. A **review package** adds engineering
tables and findings. Review reports currently use English. A package can also
compare against a saved revision: choose **Use as baseline** in Revisions first.
For subsystem scope and included files, see [review packages](engineering-workflows.md#review-packages-and-exceptions).

Save downloads outside the browser for a durable handoff. **Save** and **Share**
preserve the whole architecture, including live edits in an open subsystem;
visual exports show the current scope. Share links exceeding the 16 MiB decoded
board limit are rejected before copying.

**Loop GIF** freezes the board, translated labels, and theme when export starts;
later edits do not mix into its frames. PNG and PDF filenames stay paired with
the board that was rendered, even if you open another board before rendering ends.

## Compare and import

### Compare two saved boards

Open the current board, choose **Explore → Compare saved board**, and select an
earlier `.schematica.json` file. Inspect the before/after diagrams and changed
fields. Comparison covers the whole architecture even when a subsystem is open.
It distinguishes layout movement from configuration changes; previewing it does
not edit your board.

For a proposed part-number or rail change, use **Engineering → Change impact**.
Review affected interfaces and records before choosing **Apply previewed change**.
A changed board invalidates an old preview. Replacing a part clears the previous
part's electrical declarations; supply supported values for the replacement.

### Bring in KiCad connectivity

1. Save the current board.
2. Export an XML netlist from KiCad.
3. Choose **Engineering → Interchange → Import KiCad XML netlist** and select it.
4. Review the imported architecture and save it as a Schematica board file.
5. For a later netlist from the same source, open that saved board and choose
   **Preview KiCad update**. Inspect the proposed differences before applying.

The importer accepts KiCad XML netlists, not `.kicad_sch` files or PCB layouts.
Components become custom parts; nets become junctions and untyped links.
Electrical declarations are not inferred. Stable source identities support later
updates while preserving surviving layout and notes.

Conflicting authored declarations, ambiguous IDs and unsafe pin changes stop an
update. Old imports without source provenance require a fresh import. Read the
[interchange limits](engineering-workflows.md#interchange-and-experimental-kicad-import)
before using this experimental path on team designs.

**ICD CSV** exchanges interface text for existing matching connection IDs. It does
not create wiring and does not carry every numeric endpoint declaration. Use
board JSON for a lossless editable copy.

## Use the assistant

Drawing and checking do not require the assistant. To use it:

1. Press **A** or open **Assistant** from the toolbar.
2. Choose your provider and configure its **Model**, **Base URL** and **API key**.
   Choose **Remember the key on this device** only if you want browser persistence.
3. Choose **Save**, then **Test connection**. Provider use may be billed by that provider.
4. Keep **Preview changes before applying** enabled.
5. Describe a concrete task, inspect the proposed diagram and findings, then choose
   **Apply changes** or **Discard draft**. Applied changes can be undone.

For example:

> Review this controller-and-sensor board. Identify missing interface declarations
> and explain what evidence I need. Leave unknown values blank.

Or choose **Blueprint** to record the goal, audience, components and assumptions
before asking the assistant to build a flow. See [assistant skills and Blueprints](assistant-skills.md).

You can attach text, PDF or DOCX sources. Extraction happens locally; selected
extracted text is sent to the configured provider when you send the message.
Documents are held in memory, and ordinary messages or replies may retain quoted
content. Image-only PDFs need OCR outside this application. See
[document privacy and limits](editor-reference.md#assistant-document-privacy-and-limits).

**Stop** keeps text already received in the conversation. An interrupted preview
is discarded; edits already applied with preview disabled remain undoable.
Unfinished structured plans are not applied.

Public URL reading needs the Node-backed edition. The static edition's provider
connectivity depends on provider CORS support or the configured relay; see
[server setup](backend.md). A model response is a proposal to inspect, not verified
engineering evidence.

## Security analysis

Choose the **shield button → Security analysis** in the toolbar. This separate,
non-modal panel explains CVE records, advisories, PoC source code and patches
by **static reading only**. It never runs code, installs dependencies or tests
a target. Configure the provider in **Assistant**; both panels share its settings
and memory-only key. Provider requests may be billed by that provider.

Drag the **Assistant** or **Security analysis** title bar to move either panel
anywhere across the page, including over the palette. Each panel remembers its
position on this device. Focus the title bar and use arrow keys to nudge it;
hold Shift for larger moves. Header controls remain independent of dragging.
Window resizing and collapsing keep a draggable part of the header reachable.

1. Enter a CVE identifier and choose **Look up CVE**, enter a public source
   **URL**, choose **Add files**, or **Add pasted source**. CVE lookup and URL
   reading require the Node-backed edition. Published CVE records can bring in
   up to two relevant advisory references; failures remain visible.
   C, C++ and Python source files (`.c .h .cpp .hpp .cc .cxx .hh .hxx .c++ .py`
   `.pyw`) import as plain text — static reading never compiles or runs them —
   and a CVE record is optional: leave the field empty and analyze the
   retained source alone.
2. Review source names, coverage, hashes and warnings. Uncheck sources you do
   not want sent, or remove them. Files and pasted text remain local at this
   stage; CVE/URL reads contact the website server and public source hosts.
3. Add an optional question and choose **Analyze retained sources**. Only checked
   sources and your note are eligible for the configured model. Inspect the
   resulting summary, findings, logical relationships and unknowns. The model
   receives bounded excerpts and, when supported, requested retained line ranges.
   Initial CVE excerpts keep the source introduction and context around references
   to the requested CVE, rather than spending the entire excerpt on navigation.
   Citation line numbers remain absolute; gaps between excerpts remain unread.
   **Source retention and model-read coverage** distinguishes stored text from
   complete lines actually delivered to the model. Undelivered retained lines
   remain unassessed, even when targeted reads were available. Delivery does not
   prove comprehension; older saved analyses explicitly show coverage not recorded.
4. Click a citation to read the numbered excerpt. **Source-backed** means the
   statement cites retained text, not that exploitation was reproduced.
   **Inference** and **Unknown** remain visibly distinct. Reserved/rejected
   records and unavailable details do not establish a vulnerability.
   Every new analysis includes an outcome for affected components, root cause,
   prerequisites, steps, impact, severity, mitigations, unknowns and PoC/advisory
   consistency. An omitted area is labeled **not assessed**, not silently filled
   with a conclusion. Consistency means evidence agreement, not a working exploit.
   Keep vendor-specific scope, severity and impact claims attributed separately;
   a multi-CVE advisory's overall severity or a neighboring CVE's description
   does not establish this CVE's impact.
   For reserved/rejected records, vulnerability-specific findings and relationships
   remain **Unknown**; record-state facts and rejection reasons can still cite sources.
5. Choose **Preview visual explanation** for the illustrated overview. Under
   **Technical finding views**, **Architecture**, **Exploit path** and **Mitigation**
   remain detailed finding graphs for evidence review, not alternate illustrated styles.
   **Save analysis with board** saves the retained analysis without drawing a scene.
   Nothing changes the board until **Apply changes**; normal Undo/Redo also covers
   analysis-only saves. Applied results follow restored board history, including
   their diagram links; a separately generated unsaved result remains independent.
   Applying a visual explanation closes the drawer and frames the first new scene,
   including its panel captions, instead of fitting every older diagram on the board.
   Other scenes are available through Journey. Existing cards, connections and
   chapters are preserved; one Undo removes the new build.
   Ordinary analysis plans a concise source-supported overview without special
   notes: an actor/request/target/outcome composition, or memory, structure,
   sequence, state and comparison panels appropriate to the source. Every card
   and link shows the weakest basis of its grounding findings.
   Older analyses without scenes show **Restore analysis sources**. Restore,
   review the checked sources, and **Analyze retained sources** before previewing
   again. There is no invented fallback scene, and existing cards are not
   automatically redrawn.
   Incomplete or ambiguously grounded scenes are omitted whole with warnings,
   so removing an uncertain dependency cannot make their narrative source-backed.
   Review the warnings and reanalyze rather than treating an omitted scene as assessed.
   Two figure kinds extend those scenes. An **attack** scene places an
   illustrated actor on the left, request and return capsules in the middle,
   and a grouped target on the right — application, memory or secrets,
   pressure and an optional outcome column. A **parallel** scene aligns
   request, target and outcome rows beside one shared actor. Panels carry
   semantic placement and row hints only — never coordinates — and an
   illustrated asset is drawn only when a cited finding claims that same
   asset with an established basis; an unsupported hint keeps the neutral
   role symbol instead of decorating the picture.
   New analyses select icons from the asset library for supported operating systems,
   servers, software packages, actors, hardware and controls—not just process
   boxes. The library also carries illustrated security figure assets: an
   adversary behind a laptop, request and response capsules, payload and
   memory-dump capsules, process-memory and secret-store tiles, a memory-limit
   gauge, crash and code-execution outcome callouts, and original application
   illustrations labelled PHP, WordPress, Drupal and Joomla — original artwork
   and names, never vendor logos — each with four logical link ports and
   legible captions in light, dark and exported figures.
   Views without trust zones arrange their cards into labelled, colour-coded scene
   bands (Actors, Attack sequence, Security controls, Network & services, Systems &
   platforms, Devices, Facilities), so the picture reads as a composition of scenes
   rather than one flat flow. Grouping comes from catalogue categories and role
   glyphs, never invented containment; views with trust zones keep the flat layout
   because a trust rectangle must span exactly what the analysis declared inside.
   Each card names its asset type and evidence basis; actions remain distinct from
   the systems they affect. Connections describe logical relationships, not inferred
   physical network interfaces. Assets are selected from the findings, never guessed
   from a CVE title or added merely to decorate the diagram. Unknown findings keep
   neutral symbols. Reanalyze older results to gain source-specific asset selections;
   existing boards and manually edited illustrations are not replaced automatically.
   Long labels wrap inside their cards and connection pills. New illustrations
   follow directed relationship layers instead of a generic hub layout; only
   attack actions are numbered in exploit views, not prerequisites or root causes.
   Relationships involving metadata remain annotations rather than invented
   attack stages. Oversized metadata is rejected before changing the board,
   rather than silently truncating a relationship.
   Trust-zone membership requires explicit inside/outside/crossing metadata, not
   adjacency or a guessed interpretation of a relationship label. Ambiguous
   membership remains visible as boundary cards and labeled connections.
   Shared memberships likewise stay explicit without inventing nested domains.
6. Select a generated canvas stage to see its explanation and first cited excerpt.
   **Show walkthrough** lists linked stops; open **Journey → Present** to play
   the generated chapters. Missing board references remain visible.
   Walkthrough stops belong to the newest illustration of the selected view.
   Deleted targets remain missing rather than switching to another view or an
   older illustration. Older boards without a recorded view association must be
   illustrated again before their targets can be associated reliably.
7. **Download HTML report** creates a standalone cited report with the current
   board figure. **Print** opens browser printing; choose **Save as PDF**.
   Reports include cited excerpts. Full retained source text is **off by default**
   and requires **Include full retained source text**. Review the figure and
   source contents before sharing. The project technical report also has a
   selectable **Security analysis** section and its own full-source opt-in.

**Saving changes the privacy boundary:** an applied analysis includes its
retained source text in board files, autosave, revisions, and share links.
Anyone receiving those copies can read the sources. Unapplied imports and
analysis results stay in the current tab; reopening a saved board restores
applied findings, citations and diagram links without another model request.

The **Security** group of the Examples menu includes three small teaching
boards — a C stack copy, a C++ dangling reference and a Python queue gateway —
each carrying its retained source text, findings authored by static reading
(no CVE, nothing executed, no model validation) and a ready-made mechanism
illustration with a walkthrough. Two figure boards join them: a hypothetical
PHP memory-snapshot attack composition — an unauthenticated caller, crafted
request and returned-snapshot capsules, and a PHP host with interpreter
memory, secrets, a 24M limit and conditional outcomes — and a parallel
application-outcome composition with one shared caller and four aligned
scenario rows. Both figure boards are synthetic teaching scenarios written
for the examples; the WordPress, Drupal and Joomla row names are labels the
retained scenario text itself disclaims, every outcome is conditional, and
neither board is a PHP2Shell or CVE applicability assessment for any product.

PoC behavior may be described or inferred, never verified by this workflow.
Product/version/configuration applicability and deployment risk still require
review. Source hashes identify retained normalized/extracted text, not an
authenticated original artifact. PDF/DOCX citations refer to extracted lines,
not original page coordinates; scanned PDFs require external OCR.
See [security limits](editor-reference.md#security-analysis-records-and-limits).


## Present your board

1. Open **Journey** in the toolbar and frame the area you want to show.
2. Choose **+ Add step from current view**. A step acts as a chapter.
3. Select parts and choose **Link selection** to keep the chapter linked to them.
4. Choose **Add selected parts as stops** for an ordered tour. Edit captions and
   use the up/down controls to set the order.
5. Choose **Present**. Use arrow keys to navigate, Space to play/pause and Escape
   to exit. **Show all** returns to an overview.

**Export → Interactive HTML** keeps the tour in an offline file. **Copy moment**
links to a chapter or stop; for an offline file, send the HTML file along with
its moment fragment. A recording captures the presented camera and captions.
See [presentation behavior](presentation-stories.md) for details.

## Review with a team

There are two distinct workflows:

| Workflow | Location | Identity and storage |
| --- | --- | --- |
| Portable local review | **Engineering → Review comments** | Names are entered locally; board/review files are exchanged manually |
| Server-backed team review | **Team reviews** in the palette | An operator issues credentials and configures private server storage |

For local review, start a revision review, add comments and resolve them before
approving. A later design change makes the local approval stale. Export the
comments together with the corresponding board or review package.

For shared review, first obtain a team access token from your server operator:

1. Open **Team reviews**, enter the token and choose **Connect**.
2. As a project creator, enter a title and choose **Create project from local board**.
3. Add a configured user ID under **Project members**, choose **Reviewer** or
   **Editor**, and choose **Update member**. An owner manages membership; an
   editor can publish revisions; reviewers can discuss and record decisions.
4. Select a project and **Review snapshot**. Check whether your local board matches
   it; the displayed server snapshot does not replace the local editor.
5. Add comments, resolve discussions, then record **Approved** or **Changes requested**.
6. After a design change, an editor chooses **Publish local board as new revision**.
   The previous revision's approval does not approve this new snapshot.
7. Use **Export shared review** for the project records or **Download snapshot
   review package** for the selected snapshot. Close the dialog to disconnect.

If another person changed the project, your save can return a conflict. Copy any
important draft text before **Refresh**, review the new state and consciously
resubmit. Refresh rebuilds the form. Tokens are kept only in memory and are
cleared when the dialog closes.

If the dialog says shared reviews require an enabled server, use portable local
reviews or ask your operator to follow [team-review setup](team-reviews.md).
Static hosting does not provide shared-review storage.

## Keyboard shortcuts

Click outside text fields before using single-letter shortcuts. `Ctrl/Cmd` means
Ctrl on Windows/Linux and Command on macOS. Press **?** for the full shortcut list.

| Action | Shortcut |
| --- | --- |
| Select / wire / zone / note | V / C / Z / N |
| Pan | Hold Space and drag, or H for the hand tool |
| Fit diagram / explore | F / / |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Save editable board | Ctrl/Cmd+S |
| Duplicate / copy / paste | Ctrl/Cmd+D / Ctrl/Cmd+C / Ctrl/Cmd+V |
| Move selected items | Arrow keys; Shift+arrow for a grid step |
| Lock / unlock | K |
| Show/hide palette / right panels / assistant | B / P / A |
| Submit the Connect ports form | Ctrl+Enter or Cmd+Enter |
| Close a dialog | Escape |

## Glossary

| Term | Meaning in Schematica |
| --- | --- |
| Board | The editable architecture document, including its parts and records |
| Part / port | A component card / a connection point on that card |
| Bus | A connection type, such as I2C, UART, CAN or power |
| Declaration | Information you enter about a connection or endpoint; unknown values stay unknown |
| Revision / snapshot | A saved version of a board |
| Baseline | A saved version selected as the starting point for comparison |
| Subsystem | A group represented by a container with internal parts and exposed connections |
| Allocation | A link between a requirement or decision and the parts/wires it concerns |
| Stale evidence | Evidence recorded against a design that has since changed |
| ICD / BOM | Interface control document / bill of materials |
