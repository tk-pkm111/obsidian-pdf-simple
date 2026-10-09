# PDF Simple

**Just trace the PDF.** Highlight PDFs in Obsidian's built-in viewer, and the highlighted text collects in a note paired with the PDF. No more copying passages by hand or tidying them up afterwards.

[日本語の説明はこちら（README.ja.md）](README.ja.md)

https://github.com/user-attachments/assets/5667a2b6-7cd8-47cd-9c57-350b813780ce

The getting started video is in Japanese. The plugin's interface follows Obsidian's language (English or Japanese).

## Features

| | |
|---|---|
| **Trace to highlight** | Select text in a PDF with the mouse. It is highlighted right away, and the text is added to the paired note, keeping its paragraphs and lists. |
| **Colors and headings** | The pen at the top right of the PDF switches colors and heading levels (H1 to H3). Mark chapter headings first, and body text goes under its chapter. |
| **Jump both ways** | Click the dot after a highlight in your note to open the PDF there, and click a highlight in the PDF to jump back to the note. Edit the note text freely. |
| **Capture figures** | Draw a rectangle on the PDF to save that area as a PNG and embed it in the note. |
| **Choose where highlights go** | Insert highlights under a heading of your choice. If a note ends with data from other plugins (such as Excalidraw), highlights go before it. |
| **Keep PDFs organized** | Highlighted PDFs can be moved into a folder of your choice automatically. |

The PDF file itself is never modified. The note keeps only the text (`quoted text ^hl-xxxxxx`), and the position and color of each highlight are stored in the note property `pdf-highlights` (hidden in the properties panel).

## Getting started

1. Install and enable the plugin (see [Installation](#installation)).
2. On first load, a "Welcome to PDF Simple" screen opens with a 2-minute video. Open it again any time with the command "Show getting started" or from the top of **Settings → PDF Simple**.
3. Open a PDF and select text with the mouse. A note with the PDF's name is created, and the text is added.
4. Optionally, choose the heading for highlights and the PDF storage folder in **Settings → PDF Simple**.

## Installation

Until PDF Simple is listed in the community directory, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from **Settings → Community plugins**.
2. Run **BRAT: Add a beta plugin for testing** from the command palette and enter `tk-pkm111/obsidian-pdf-simple`.
3. Enable **PDF Simple** in **Settings → Community plugins**.

The plugin writes to your notes (it never modifies PDF files), so back up important vaults before trying it.

## Usage

### Highlighting

- Select text in a PDF with the mouse. When you release the button, it is highlighted with the pen's color and style (body text or heading). If the selection ends in the middle of an English word, it extends to the word boundary.
- Hold Alt (Option) while selecting to skip highlighting, for example to copy text.
- The pen button at the top right of the PDF switches the color, the style (body text or heading 1 to 3), and what happens when you select text (highlight right away, pick a color first, or off). A heading style stays on until you switch back, which is handy for marking chapter headings first.
- With "pick a color first", color buttons and a "Heading" button appear near the selection. Hover "Heading" to insert that highlight as heading 1 to 3.
- Keyboard and touch selections show the color buttons (a bar at the bottom of the screen on mobile). For a PDF without a paired note, the color buttons also appear the first time, and choosing one creates the note.
- To undo a mistake, right-click the highlight in the PDF and choose **Remove highlight**, or run **Undo last highlight**.

### What goes into the note

- Each highlight becomes one paragraph in the PDF's note, with blank lines around it. If the note doesn't exist, `<PDF name>.md` is created.
- **Paragraphs and lists are kept.** Line wraps inside a paragraph are joined, while breaks between paragraphs and list items (such as `・`, `①`, or `1.`) are kept.
- **Where it goes.** By default, highlights go at the end of the note. If the end of the note holds data used by other plugins (Excalidraw drawing data from `# Excalidraw Data`, or hidden `%%` comments), highlights go before it.
- **Under a heading.** In **Heading for highlights**, write one heading per line, like a Markdown heading (for example `## Summary`). In notes that have that heading, highlights go under it. Only headings with the same number of `#` and the same capitalization match. Write `Summary` without `#` to match any heading level.
- **If a note has two or more of those headings**, you're asked which one to use the first time you highlight (cancel to skip). The choice is saved in the note's `pdf-highlights-heading` property, and later highlights go there.
- **Per note.** Right-click a heading in the note and choose **Insert PDF highlights under this heading**. It's saved in the same property, and the same menu removes it.
- **PDF order.** Within the chosen place, highlights are ordered as in the PDF, not in the order you made them. If you mark chapter headings first, body text you highlight later goes under its chapter. You can switch to "Order added" in settings. Under a heading, heading highlights are nested one level deeper (under `## Summary`, heading 1 becomes `###`).
- **Headings** are added as `## text`, with a small "H2" badge on the PDF. Change the level later with **Change heading level…** in the right-click menu.
- **Capture regions.** Press the square button at the top right of the PDF and drag a rectangle on the page. The area is saved as a PNG in your attachments folder and embedded in the note, and a frame is drawn on the PDF. Click its border or badge to jump to the note. Press Esc or the button again to cancel.

### Jumping between note and PDF

- **Click a highlight in the PDF** to open its line in the note (flipping in the same tab). Right-click it for **Open in note**, **Change color…**, **Copy text**, and **Remove highlight**. Hold Cmd/Ctrl while hovering to preview the note line.
- **Click the dot after a highlight in the note** to open the PDF at that spot. It scrolls to the center and flashes. The text itself is plain text that you can click and edit. Right-click it for **Open in PDF**, **Change color…**, **Unlink from PDF (keep text)**, and **Remove highlight (with text)**.
- **Flip** with **Open PDF (back)** in the note and **Back to note (front)** in the PDF, at the top right. The page and scroll position are remembered. Hold Cmd/Ctrl to open in a new tab.

### Editing highlights in the note

- Cut and paste highlight lines freely, including `^hl-…`. If you paste one into another note, clicking the highlight in the PDF takes you there.
- Write your own text around a highlight. If you type right below one, a blank line is inserted automatically so the link isn't broken, and pressing Enter at the end of a highlight also inserts a blank line.
- Deleting a highlight line also removes it from the PDF. When you remove a highlight from the PDF, the note line is removed if its text is unchanged; if you edited it, the text is kept and only the link is removed. Leftover records can be cleaned up with **Clean up highlight records without text**.

### Pairing notes and PDFs

- A note is paired with a PDF through the property `pdf: "[[paper.pdf]]"`. Set it with **Attach a PDF to this note**, or with **Attach PDF…** in the note's file menu.
- Without the property, the first PDF link or embed in the note is used.

### PDF storage

- Set **PDF storage folder** (for example `Library/PDF`), and a PDF is moved there when you highlight it or attach it to a note. The folder is created if missing, and a number is added if the name is taken. Wherever you drop PDFs in your vault, they gather in that folder once you start using them.
- Links to the PDF (note properties and embeds) are updated by Obsidian, as with any file move.
- Turn off **Move PDFs when highlighting** to move PDFs only manually: use **Move to PDF storage folder** in the PDF's right-click menu, or the command **Move PDF to storage folder**.
- PDFs already in a subfolder of the storage folder aren't moved. If the setting is empty, PDFs are never moved.

### Commands

| Command | What it does |
|---|---|
| Flip between note and PDF | Switch between the note and its PDF |
| Attach a PDF to this note | Choose a PDF to pair with the note |
| Open the note for this PDF (create if missing) | While a PDF is open |
| Highlight selection / Highlight selection (color) | One command per color; assign hotkeys or add them to the mobile toolbar |
| Toggle instant highlight | Switch between highlighting on select and off |
| Set pen to body text / Set pen to heading 1, 2, 3 | Switch the style (it stays until you change it) |
| Capture region as image | While a PDF is open (same as the square button) |
| Undo last highlight | Remove the last highlight, including its note line |
| Open highlight at cursor in PDF / Change color of highlight at cursor / Remove highlight at cursor | While editing a note |
| Insert PDF highlights under the heading at cursor | On a heading line (same as right-clicking the heading) |
| Move PDF to storage folder | Move the open PDF, or the note's attached PDF, to the storage folder |
| Clean up highlight records without text | Remove records whose text is gone from every note |
| Show getting started | Open the video and the overview |

### Settings

Getting started (at the top), colors (add, remove, reorder), default color, insert as (body text or heading 1 to 3), when you select text (highlight right away, pick a color first, or do nothing), heading for highlights (one per line; empty means the end of the note), order of highlights (PDF order or order added), bullet list (off by default), hide records in properties (on by default), PDF storage folder and whether to move PDFs when highlighting, how to flip (same tab or side by side), and the property for the attached PDF.

### Limitations

- Selections that span pages can't be highlighted (the same as Obsidian's **Copy link to selection**).
- PDFs without selectable text (scanned images only) can't be highlighted.
- Highlights aren't drawn on PDFs embedded in notes (`![[…]]`).
- One highlight per line. If you join two highlight lines, or remove the blank line between two highlight paragraphs, one of them disappears from the PDF, because Obsidian recognizes block IDs only at the end of a paragraph.
- Captured images are made from the PDF at capture time. Removing a highlight doesn't delete the image file, as when you remove an embed in Obsidian.
- Highlights are drawn on Obsidian's built-in PDF view. If an Obsidian update changes its internal structure, they may not be drawn. You're notified once, and the records in your notes are kept.
- If you replace a PDF and the text moves, its highlights are shown with a dotted outline.

## Privacy and permissions

- **Network**: the getting started video is loaded from GitHub (github.com) only when you press play. The plugin makes no other network requests and never sends your PDFs or notes anywhere.
- **Vault access**: the plugin reads note metadata (properties and block IDs) through Obsidian's metadata cache to find highlights and their PDFs, lists the PDFs in your vault when you attach one, and reads all notes only when you run **Clean up highlight records without text** (after you confirm). It writes only to the notes it adds highlights to and to the PNG files it captures, and moves PDFs only as described in [PDF storage](#pdf-storage).
- **Clipboard**: **Copy text** in a highlight's right-click menu writes the highlight's text to the clipboard. The plugin never reads the clipboard.

## License

MIT ([LICENSE](LICENSE))

## Development

```bash
npm install
npm run vault:setup        # set up the development vault (dev-vault/) with hot-reload
npm run references:fetch   # fetch the official docs and the sample plugin into references/
npm run dev                # watch build, copied into dev-vault/
```

Open `dev-vault/` as a vault in Obsidian and trust its plugins. Edits are reloaded automatically. `dev-vault/PDF/` contains generated test PDFs with no personal data.

| Command | What it does |
|---|---|
| `npm run dev` | Watch build and copy to dev-vault |
| `npm run build` | Production build (with type check) |
| `npm run check` | Type check, lint, format check, and tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run format` | Format the code |
| `npm run e2e -- launch` and so on | Drive an isolated Obsidian instance (see [docs/harness.md](docs/harness.md)) |

Design notes (in Japanese): [docs/implementation-plan.md](docs/implementation-plan.md). The source of the getting started video is in `promo/`.

```
src/main.ts          lifecycle (registration, onLayoutReady)
src/commands.ts      commands
src/actions.ts       actions called from commands, menus, and clicks
src/settings-tab.ts  settings tab (declarative)
src/i18n/            UI text in Japanese and English (t('key'))
src/lib/             pure logic without the Obsidian API (tested with vitest)
src/index/           index (metadata cache) and pairing
src/note/            note side (writing, navigation, decorations, menus)
src/viewer/          PDF side (built-in viewer DOM, overlay, selection, toolbar, region capture)
src/pdf/             types for the bundled pdf.js (loadPdfJs) and rendering regions to PNG
src/flip/            flipping between note and PDF
src/ui/              modals, labels, and the getting started screen
tests/               vitest
scripts/             dev vault setup, reference fetching, E2E
promo/               source of the getting started video
```

Requirements: Obsidian 1.13.0 or later. Works on desktop and mobile (no Node.js or Electron APIs).
