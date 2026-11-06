/**
 * ボタンの下に出す吹き出し（使い始めてから 1 回だけのヒント）。
 * 「わかった」・Esc・吹き出しの外を押す（そのボタンを押すのも含む）で閉じる。戻り値を呼んでも閉じる。
 */
export function showTip(
	anchor: HTMLElement,
	title: string,
	body: string,
	ok: string,
	onClose: () => void,
): () => void {
	const doc = anchor.doc;
	const win = anchor.win;
	const rect = anchor.getBoundingClientRect();
	const bubble = doc.body.createDiv({
		cls: 'pdf-simple-tip',
		attr: { role: 'dialog', 'aria-label': title },
	});
	// ボタンの右端にそろえ、矢印はボタンの真ん中を指す
	bubble.setCssProps({
		'--pdf-simple-tip-top': `${Math.round(rect.bottom + 10)}px`,
		'--pdf-simple-tip-right': `${Math.max(8, Math.round(win.innerWidth - rect.right - 6))}px`,
		'--pdf-simple-tip-arrow': `${Math.round(rect.width / 2 + 6 - 7)}px`,
	});
	bubble.createDiv({ cls: 'pdf-simple-tip-title', text: title });
	bubble.createDiv({ cls: 'pdf-simple-tip-body', text: body });
	const button = bubble.createEl('button', {
		cls: 'mod-cta',
		text: ok,
		attr: { type: 'button' },
	});
	anchor.addClass('pdf-simple-tip-target');

	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		anchor.removeClass('pdf-simple-tip-target');
		bubble.remove();
		doc.removeEventListener('pointerdown', onPointerDown, true);
		doc.removeEventListener('keydown', onKeyDown, true);
		win.removeEventListener('resize', close);
		onClose();
	};
	const onPointerDown = (evt: PointerEvent) => {
		if (evt.targetNode && bubble.contains(evt.targetNode)) return;
		close();
	};
	const onKeyDown = (evt: KeyboardEvent) => {
		if (evt.key === 'Escape') close();
	};
	button.addEventListener('click', close);
	doc.addEventListener('pointerdown', onPointerDown, true);
	doc.addEventListener('keydown', onKeyDown, true);
	win.addEventListener('resize', close);
	return close;
}
