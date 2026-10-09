import type { ja } from './ja';

/** English UI text. Keys must match ja.ts. Use sentence case. */
export const en: Record<keyof typeof ja, string> = {
	// Commands (Obsidian adds the plugin name in front)
	'command.flip': 'Flip between note and PDF',
	'command.attachPdf': 'Attach a PDF to this note',
	'command.createNoteForPdf':
		'Open the note for this PDF (create if missing)',
	'command.highlightSelection': 'Highlight selection',
	'command.highlightSelectionWithColor': 'Highlight selection ({color})',
	'command.openHighlightInPdf': 'Open highlight at cursor in PDF',
	'command.recolorHighlightAtCursor': 'Change color of highlight at cursor',
	'command.removeHighlightAtCursor': 'Remove highlight at cursor',
	'command.cleanOrphanEntries': 'Clean up highlight records without text',
	'command.movePdf': 'Move PDF to storage folder',
	'command.insertUnderHeading':
		'Insert PDF highlights under the heading at cursor',
	'command.toggleInstantHighlight': 'Toggle instant highlight',
	'command.penText': 'Set pen to body text',
	'command.penHeading': 'Set pen to heading {level}',
	'command.captureRegion': 'Capture region as image',
	'command.undoLastHighlight': 'Undo last highlight',
	'command.showWelcome': 'Show getting started',

	// Buttons at the top right of the PDF
	'toolbar.penLabel': '{color} · {kind}',
	'toolbar.penHighlight': 'Pen: {color} (highlight on select)',
	'toolbar.penPopup': 'Pen: {color} (pick a color first)',
	'toolbar.penNone': 'Pen: off (select only)',
	'toolbar.region': 'Capture region as image',
	'toolbar.regionArmed':
		'Drag on the page to select a region (press again or Esc to cancel)',

	// View header buttons
	'action.openPdf': 'Open PDF (back)',
	'action.openNote': 'Back to note (front)',

	// Menus
	'menu.openNote': 'Open in note',
	'menu.openNoteIn': 'Open note: {name}',
	'menu.recolor': 'Change color…',
	'menu.copyText': 'Copy text',
	'menu.delete': 'Remove highlight',
	'menu.deleteLine': 'Remove highlight (with text)',
	'menu.unlink': 'Unlink from PDF (keep text)',
	'menu.changeHeading': 'Change heading level…',
	'menu.headingLevel': 'Heading {level}',
	'menu.kindText': 'Body text',
	'menu.sectionColor': 'Color',
	'menu.sectionKind': 'Insert as',
	'menu.sectionAction': 'On select',
	'menu.selectHighlight': 'Highlight on select',
	'menu.selectPopup': 'Pick a color first',
	'menu.selectNone': 'Off (select only)',
	'menu.openInPdf': 'Open in PDF',
	'menu.movePdf': 'Move to PDF storage folder',
	'menu.movePairedPdf': 'Move attached PDF to storage folder',
	'menu.insertUnderHeading': 'Insert PDF highlights under this heading',
	'menu.clearInsertHeading':
		'Stop inserting PDF highlights under this heading',
	'menu.attachPdf': 'Attach PDF…',
	'menu.changePdf': 'Change attached PDF…',
	'menu.openPairedNote': 'Open note (front)',
	'menu.createNote': 'Create a note for this PDF',

	// Notices
	'notice.noteCreated':
		'Created the note "{name}". Your highlights will collect here.',
	'notice.attached': 'Attached "{pdf}".',
	'notice.duplicateHighlight': 'This passage is already highlighted.',
	'notice.emptySelection': 'The selection has no text.',
	'notice.noSelection': 'Select text in the PDF within a single page.',
	'notice.unsafePdfName':
		'The PDF file name contains one of # ^ [ ] |, so highlights cannot be recorded. Rename the file.',
	'notice.highlightFailed': 'Could not save the highlight: {message}',
	'notice.highlightRemoved': 'Highlight removed.',
	'notice.highlightKept':
		'The note text had been edited, so it was kept (the PDF highlight was removed).',
	'notice.unlinked': 'Unlinked from the PDF.',
	'notice.nothingToUndo': 'There is no highlight to undo.',
	'notice.pdfMoved': 'Moved the PDF to "{folder}".',
	'notice.pdfMoveFailed': 'Could not move the PDF: {message}',
	'notice.insertHeadingSet':
		'In this note, PDF highlights will go under "{heading}".',
	'notice.insertHeadingCleared':
		'This note no longer has its own heading for highlights (your settings apply).',
	'notice.insertHeadingSkipped':
		'No heading was chosen, so nothing was highlighted.',
	'notice.penText': 'Pen set to body text.',
	'notice.penHeading':
		'Pen set to heading {level}. Selected text will be added as a heading.',
	'notice.regionArmed': 'Drag on the page to select the region to capture.',
	'notice.regionFailed': 'Could not capture the image: {message}',
	'notice.regionPassword':
		'Password-protected PDFs cannot be captured as images.',
	'notice.instantOn': 'Instant highlight is on.',
	'notice.instantOff': 'Instant highlight is off (select only).',
	'notice.pdfNotFound': 'PDF not found: {path}',
	'notice.noteNotFound': 'Note not found: {path}',
	'notice.notHighlightLine': 'There is no highlight on the cursor line.',
	'notice.overlayUnavailable':
		"Highlights could not be drawn in this version of Obsidian's PDF view. The records in your notes are unchanged.",
	'notice.orphansNone': 'There are no highlight records to clean up.',
	'notice.orphansRemoved': 'Cleaned up {count} highlight records.',
	'notice.rescued':
		'Moved {count} highlights from a deleted note to the note that has their text.',

	// Modals
	'modal.choosePdf': 'Choose a PDF to attach',
	'modal.chooseNote': 'Choose a note for the highlight',
	'modal.chooseColor': 'Choose a color',
	'modal.chooseHeading': 'Choose a heading level',
	'modal.headingNone': 'Body text (not a heading)',
	'modal.noPdfs': 'There are no PDFs in this vault.',
	'modal.insertHeadingTitle': 'Choose the heading for highlights',
	'modal.insertHeadingBody':
		'This note has more than one of the headings from your settings. Which one should highlights go under? Your choice is saved in this note (property pdf-highlights-heading), and later highlights go there. Right-click a heading to change it.',
	'modal.orphansTitle': 'Clean up highlight records without text',
	'modal.orphansBody':
		'Remove {count} highlight records from properties because no note contains their ^hl-… text.',
	'modal.orphansMore': 'and {count} more',
	'modal.delete': 'Delete',
	'modal.cancel': 'Cancel',
	'modal.addColorTitle': 'Add color',
	'modal.colorName': 'ID',
	'modal.colorNameDesc':
		'The name written in links. It starts with a lowercase letter and uses only lowercase letters, digits, and hyphens (e.g. pink).',
	'modal.colorLabel': 'Display name',
	'modal.colorLabelDesc':
		'The name shown in the interface (the ID if empty).',
	'modal.colorValue': 'Color',
	'modal.add': 'Add',
	'modal.invalidColorName':
		'Use a name that starts with a lowercase letter and contains only lowercase letters, digits, and hyphens.',
	'modal.duplicateColorName': 'That ID is already in use.',

	// Getting started screen
	'welcome.title': 'Welcome to PDF Simple',
	'welcome.lead':
		'Just trace text in a PDF, and the passages you highlight collect in your note. Start with the 2-minute video to see how it works.',
	'welcome.videoTitle': 'Getting started in 2 minutes',
	'welcome.play': 'Play the getting started video',
	'welcome.videoNote': 'Plays from GitHub (the video is in Japanese)',
	'welcome.videoError':
		'Could not load the video. Check your internet connection.',
	'welcome.openInBrowser': 'Open in browser',
	'welcome.step1Title': 'Trace to highlight',
	'welcome.step1Body':
		'Select text in the PDF with your mouse. It is highlighted right away, and the text goes into your note.',
	'welcome.step2Title': 'Colors and headings',
	'welcome.step2Body':
		'Use the pen at the top right of the PDF to switch colors and heading levels.',
	'welcome.step3Title': 'Jump between note and PDF',
	'welcome.step3Body':
		'Click the dot in your note to open the PDF there, and click a highlight in the PDF to jump back.',
	'welcome.step4Title': 'Where highlights go',
	'welcome.step4Body':
		'In Settings → PDF Simple, choose the heading for highlights and the folder for your PDFs.',
	'welcome.hint':
		'Open this screen any time with the command "Show getting started".',
	'welcome.more': 'Learn more on GitHub',
	'welcome.start': 'Get started',

	// Settings
	'settings.groupHelp': 'Getting started',
	'settings.showWelcome': 'Show getting started',
	'settings.showWelcomeDesc':
		'Open the video and the overview of what you can do.',
	'settings.colors': 'Colors',
	'settings.addColor': 'Add color',
	'settings.colorsEmpty': 'There are no colors.',
	'settings.colorDesc': 'ID: {name}',
	'settings.groupHighlight': 'Highlighting',
	'settings.defaultColor': 'Default color',
	'settings.defaultColorDesc':
		'Used for instant highlights and for commands without a color. You can also change it with the pen button at the top right of the PDF.',
	'settings.selectAction': 'When you select text',
	'settings.selectActionDesc':
		'What happens when you select text in a PDF with the mouse. Hold Alt (Option) while selecting to skip highlighting. Keyboard and touch selections show the color buttons.',
	'settings.defaultHeading': 'Insert as',
	'settings.defaultHeadingDesc':
		'Insert selected text as body text or as a heading. A heading stays on until you switch back, so you can mark chapter headings one after another. You can also change it with the pen button at the top right of the PDF.',
	'settings.selectHighlight': 'Highlight right away',
	'settings.selectPopup': 'Pick a color, then highlight',
	'settings.selectNone': 'Do nothing',
	'settings.groupNote': 'Note',
	'settings.insertHeading': 'Heading for highlights',
	'settings.insertHeadingDesc':
		'If a note has one of these headings, highlights go under it. Otherwise they go at the end of the note.',
	'settings.insertHeadingDescFormat':
		'Write one per line, like a Markdown heading (e.g. ## Summary). Only headings with the same number of # and the same capitalization match. Without #, any heading level matches.',
	'settings.insertHeadingDescConflict':
		'If a note has two or more of these headings, you are asked which one to use the first time you highlight. Your choice is saved in the note, and later highlights go there. You can also right-click a heading in the note to choose it.',
	'settings.insertHeadingDescEnd':
		'If the end of the note holds data used by other plugins (such as Excalidraw drawing data or hidden %% comments), highlights go before it.',
	'settings.insertHeadingPlaceholder': '## Summary\n## Highlights',
	'settings.invalidHeading':
		'"{line}" is not a valid heading. Put a space after #, like "## Summary".',
	'settings.insertPosition': 'Order of highlights',
	'settings.insertPositionDesc':
		'How highlights are ordered where they go. With PDF order, if you mark chapter headings first, body text goes under its chapter.',
	'settings.insertOrder': 'PDF order',
	'settings.insertEnd': 'Order added (append at the end)',
	'settings.bulletList': 'Use a bullet list',
	'settings.bulletListDesc':
		'Start each highlight with "- ". When off, each highlight is its own paragraph (with blank lines around it).',
	'settings.hideEntriesProperty': 'Hide records in properties',
	'settings.hideEntriesPropertyDesc':
		"Hide the row with positions and colors in the PDF (pdf-highlights) in the note's properties. The records stay in the note (visible in source mode).",
	'settings.groupPdf': 'PDF storage',
	'settings.pdfFolder': 'PDF storage folder',
	'settings.pdfFolderDesc':
		'The folder for PDFs paired with notes. It is created if missing. Leave it empty to never move PDFs (PDFs already in one of its subfolders stay where they are).',
	'settings.pdfFolderPlaceholder': 'e.g. Library/PDF',
	'settings.autoMovePdf': 'Move PDFs when highlighting',
	'settings.autoMovePdfDesc':
		'Move a PDF to the storage folder when you highlight it or attach it to a note. Obsidian updates links to the PDF (note properties and embeds). Even when this is off, you can move it from the PDF\'s right-click menu or with the command "Move PDF to storage folder".',
	'settings.groupFlip': 'Note and PDF',
	'settings.flipMode': 'How to flip',
	'settings.flipSameLeaf': 'Swap in the same tab',
	'settings.flipSplit': 'Open side by side',
	'settings.flipModeDesc':
		'Hold Cmd / Ctrl to open in a new tab regardless of this setting.',
	'settings.groupAdvanced': 'Advanced',
	'settings.pairingProperty': 'Property for the attached PDF',
	'settings.pairingPropertyDesc':
		'The name of the property that links a note to its PDF.',
	'settings.invalidProperty':
		'The property name contains characters that are not allowed (. : # [ ] and so on).',
	'settings.reservedProperty':
		'pdf-highlights and pdf-highlights-heading are used by this plugin and cannot be used.',

	// Default color names
	'color.yellow': 'Yellow',
	'color.red': 'Red',
	'color.green': 'Green',
	'color.blue': 'Blue',
	'color.purple': 'Purple',
	'color.orange': 'Orange',

	// Popup shown when text is selected
	'popup.heading': 'Heading',
	'popup.asHeading': 'Insert as heading {level}',
	'popup.asText': 'Insert as body text',

	// Labels written in notes
	'label.image': 'image',

	// Tooltips
	'tooltip.openInPdf': 'Open page {page} of the PDF',
	'tooltip.highlightWith': 'Highlight in {color}',
};
