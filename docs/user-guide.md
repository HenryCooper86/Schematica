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
| Review findings, interfaces, requirements and changes | **Engineering → Review package → Download review package** | An HTML report with embedded design data and downloads |
| Insert a picture into a document | **Export → PNG**, **Copy PNG** or **SVG** | Raster or vector artwork |
| Print a static diagram | **Export → PDF** | A single-page PDF |
| Inspect the parts list | **BOM** | Grouped bill of materials with CSV/Markdown options |
| Watch a tour | **Rec**, or **Export → Loop GIF** for a short animation | A recording or animated image |

A share link carries the board's content: give it only to people who should see
that content. It is not an access-controlled team workspace. Opening one loads
the shared board and offers recovery of the previous board when a backup is kept.
Save an important board before switching.

**Interactive HTML** emphasizes exploration. A **review package** adds engineering
tables and findings. Review reports currently use English. A package can also
compare against a saved revision: choose **Use as baseline** in Revisions first.
For subsystem scope and included files, see [review packages](engineering-workflows.md#review-packages-and-exceptions).

Save downloads outside the browser for a durable handoff. **Save** preserves the
whole architecture, including subsystems; visual exports show the current scope.

## Compare and import

### Compare two saved boards

Open the current board, choose **Explore → Compare saved board**, and select an
earlier `.schematica.json` file. Inspect the before/after diagrams and changed
fields. The comparison distinguishes layout movement from configuration changes;
previewing it does not edit your board.

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

Public URL reading needs the Node-backed edition. The static edition's provider
connectivity depends on provider CORS support or the configured relay; see
[server setup](backend.md). A model response is a proposal to inspect, not verified
engineering evidence.

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
