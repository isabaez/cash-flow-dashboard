/**
 * Make an overflowing scroll container keyboard-operable.
 *
 * A `<div style="overflow:auto">` can only be scrolled with a mouse or touch
 * unless it is focusable, which strands keyboard users in front of a table whose
 * right-hand columns they cannot reach (WCAG 2.2 SC 2.1.1). Giving it a tab stop
 * and a region role fixes that — but only when it actually overflows, so pages
 * that fit do not collect pointless tab stops.
 */
export function scrollable(node: HTMLElement, label: string) {
	let current = label;

	function sync() {
		const overflows = node.scrollWidth > node.clientWidth + 1;
		if (overflows) {
			node.tabIndex = 0;
			node.setAttribute('role', 'region');
			node.setAttribute('aria-label', current);
		} else {
			node.removeAttribute('tabindex');
			node.removeAttribute('role');
			node.removeAttribute('aria-label');
		}
	}

	sync();
	const observer = new ResizeObserver(sync);
	observer.observe(node);
	// Column count can change without the box resizing (a filter, a new row).
	const mutations = new MutationObserver(sync);
	mutations.observe(node, { childList: true, subtree: true });

	return {
		update(next: string) {
			current = next;
			sync();
		},
		destroy() {
			observer.disconnect();
			mutations.disconnect();
		}
	};
}
