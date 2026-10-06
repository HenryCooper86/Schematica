# Troubleshooting

[Documentation home](README.md) · [Getting started](getting-started.md) · [User guide](user-guide.md)

## Saving and recovery

### My board is missing on another device or website

Autosave belongs to the browser and site where you worked. The production site,
GitHub Pages and localhost have separate storage. Open the original site in the
original browser, use **Save**, then open that `.schematica.json` file at the
new location. My parts templates have a separate library export/import.

### I opened the wrong example or board

Open **Engineering → Revisions** and look for the previous board's title. Restore
the appropriate revision, or open a board file you previously downloaded. A
shared-link notice may also offer to restore the previous board. Save important
work to a file before switching designs.

### I see “Not saved” or a storage error

Download the current board with **Save** first. In **Engineering → Revisions**,
choose **Retry saving revisions** and check for **Saved on this device**. Browser
storage restrictions or a full quota can prevent persistence. Do not clear site
data or close the only copy of the board before saving a file. A snapshot held
only in memory will not survive closing the page.

### Another tab changed the board

Preserve the version you want to keep as a file. Open **Engineering → Revisions**
and choose **Keep this version** or **Open other version** after comparing the
available snapshots. Close extra editing tabs once resolved. Schematica detects
conflicts; it does not automatically merge their changes.

### The first-project starter will not load

The guide requires a durable recovery snapshot before replacing the board.
Save a file copy, retry recovery storage and try again. If the message says the
board changed, finish the current edit or drag and restart the load. This keeps
a delayed load from replacing newer work.

## Drawing and checks

| Symptom | What to try |
| --- | --- |
| The palette or Properties panel disappeared | Click outside text fields; press **B** for the palette or **P** for right panels |
| The board looks empty or cut off | Press **F** to fit it; choose **Reset exploration** if filters are active |
| Ports are not visible | Hover over a card, or use **Connect ports** to choose endpoints by name |
| A part is absent from Connect ports | Check that it has supported ports and is unlocked; unlock it with **K** or Properties |
| A part will not move or delete | Check its lock state; locked items are kept in mixed selections |
| A shortcut types a letter instead | Finish the text edit and move focus out of the input |
| The drawing has no errors but is not review-ready | Look for **Unassessed** interfaces; use **Engineering → Interfaces** to complete declarations |
| Voltage or bandwidth still appears unknown | Fill the numeric limit/capability fields; free-text notes do not populate them |
| Verified evidence needs review again | Inspect changes to allocated parts and interfaces, then re-verify the requirement against the updated design |
| An old preview will not apply | Generate a new preview from the current board; the old one no longer matches |

## Files, sharing and imports

### I cannot reopen a PNG, PDF or SVG as an editable board

Use the `.schematica.json` file saved by **Save**. Images and PDFs are handoff
formats. An Interactive HTML export also provides a board JSON download; a review
package embeds downloadable design data.

### Copy PNG or Copy link failed

Clipboard permissions vary by browser and context. Download a PNG instead, or
select and copy the link text shown in the dialog. For an offline presentation,
send its HTML file along with the moment fragment; a local file path does not
transfer that file to the recipient.

### KiCad import rejects my file

Use an XML netlist, not a `.kicad_sch` file or PCB layout. An extension of `.net`
alone does not establish that the file is supported XML. Read the reported
conflict and the [import limits](engineering-workflows.md#interchange-and-experimental-kicad-import).
Do not delete source data just to silence an import error; keep the original and
resolve the conflict in a copy.

For **Preview KiCad update**, open the corresponding Schematica import with its
source provenance. An old import without provenance needs a fresh import.
Conflicting authored electrical declarations and unsafe pin changes need explicit
review before an update can proceed.

### An assistant document is blank or marked partial

Image-only PDFs need external OCR. Legacy `.doc` files need conversion to DOCX,
PDF or text. A partial indicator means extraction or request limits were reached;
inspect the preview and supply a smaller relevant document if needed. See
[document limits](editor-reference.md#assistant-document-privacy-and-limits).

## Assistant and shared reviews

| Symptom | What to try |
| --- | --- |
| Assistant connection test fails | Check **Provider**, **Model**, **Base URL** and **API key**; use **Test connection** again. Check the provider's access and quota messages |
| The server refuses a custom endpoint | Ask the operator to check the provider allowlist in [backend configuration](backend.md#configuration) |
| Public URL reading is unavailable | Use the Node-backed edition or attach a downloaded source document |
| Assistant edits have not changed the board | Inspect the preview; choose **Apply changes** or **Discard draft** |
| Team reviews requires an enabled server | The operator must configure [private storage and identities](team-reviews.md); static hosting cannot provide it |
| My team token stopped working | Ask the operator whether it was revoked or rotated; reconnect using the current token |
| A shared review save conflicts | Copy your draft text, **Refresh**, inspect the newer project version and resubmit deliberately |
| Approval is rejected | Select the latest revision and resolve its open discussion first |
| The team snapshot differs from my local board | Review the selected snapshot, or have an editor publish the intended local board as a new revision |

## Report a reproducible problem

Record the page URL, browser and OS, steps to reproduce, expected result and exact
message. Include a small board file only if it is appropriate to share. Remove
private design details and never include API keys or team tokens. Repository
issues can be filed on [GitHub](https://github.com/HenryCooper86/Schematica/issues).
