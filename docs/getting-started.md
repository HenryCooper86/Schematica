# Getting started

[Documentation home](README.md) · [User guide](user-guide.md) · [Troubleshooting](troubleshooting.md)

This tutorial takes you from opening Schematica to exporting your first design
review. You do not need an account, a model-provider key or hardware to follow it.
You will use an illustrative UART connection: a serial link between parts.

## 1. Open the editor

Open [Schematica](https://bionicloud.net/) or the
[static edition](https://henrycooper86.github.io/Schematica/). Both support this
tutorial. To run on your computer, follow [local setup](development.md#run-the-application).

The guide uses English control names. Choose **EN** if the interface is currently
Chinese. Many toolbar buttons use icons: hover over one to read its name.

| Area | What it is for |
| --- | --- |
| Top toolbar | Board title, drawing tools, zoom, save/open, examples, checks and exports |
| Left palette | Search for parts, load the first-project guide, connect ports and open team reviews |
| Center canvas | Arrange parts and draw their connections |
| Right properties panel | Edit the currently selected part, wire, note or group |
| Engineering button | Open revisions, interface declarations, requirements and review packages; its icon is beside BOM |

Press **F** to fit the diagram. If the palette is hidden, press **B**. If the
right panels are hidden, press **P**. Click outside a text field before using
these shortcuts.

## 2. Protect any existing work

If a board is already open, use **Save** in the toolbar, or **Ctrl+S** on Windows
and Linux / **Cmd+S** on macOS. Keep the downloaded `.schematica.json` file.

The walkthrough also saves a recovery revision before replacing the board. If
it reports that this revision could not be saved, keep your file copy and use
[the recovery instructions](troubleshooting.md#saving-and-recovery) before retrying.

## 3. Load the review example

In the left palette, choose **First project → Start UART review walkthrough**.
Wait for the board to load. You should see a chain of serial-interface parts and
**Ready for interface review** in the guide.

The reference declares all of the information needed for these checks. Its
numbers are teaching assumptions, not ratings for a particular physical device.

## 4. Introduce a problem and find it

Choose **Introduce rate mismatch**, then **Run checks** in the guide.

The first receiver is now declared to support **9,600 bit/s**, while the
connection requires **115,200 bit/s**. Inspect the bandwidth finding. The guide
should now say **Not ready for interface review**.

A wire can look perfectly connected while its declared requirements are
incompatible. The check makes that difference visible.

## 5. Repair the declaration

1. Close the check dialog with **Escape** or its close control.
2. Choose **Repair UART interface** in the first-project guide.
3. In the interface form, find **To endpoint capabilities**.
4. Change that section's **Bandwidth (bit/s)** from `9600` to `115200`.
5. Choose **Save interface**, then close the Engineering dialog.
6. Choose **Run checks** again.

The guide should return to **Ready for interface review**. In a real design,
change a capability only when you have a source that supports the new value;
otherwise change the design or its requirements. Here you are restoring the
example's declared teaching contract.

## 6. Export and save

Close the check dialog, then choose **Export review package** in the guide.
Open the downloaded HTML file in your browser. It contains the diagram, findings,
interface information and downloadable design data. This is the file to give a
colleague who wants to inspect your review without running the editor.

Also use **Save** to keep a `.schematica.json` file for continued editing.
An exported image is useful in a slide or document, but it is not a substitute
for that editable file.

## 7. Try Undo, then return to your work

Choose **Undo** in the guide. The mismatched declaration returns, and readiness
becomes incomplete again. Undo once more to restore the original contract before
the mismatch was introduced. Exporting the review did not add an undo step.

To recover the board you had before the tutorial, choose **Review versions** in
the guide, or **Engineering → Revisions**. Find the recovery snapshot with your
previous board's title and choose **Restore**. You can also use **Open** to load
the `.schematica.json` file you saved at the start.

## Next: draw your own board

Follow [Build and edit a board](user-guide.md#build-and-edit-a-board) to create a
controller-and-sensor sketch. Or choose **First project → Load sensor starter**
to explore a larger example. That starter has undeclared interface details;
a drawing with no blocking design finding can still need interface review.

Keep these three actions separate: **Save** preserves editable work, **Check**
examines declared design information, and **Export** prepares a handoff.
