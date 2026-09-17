<script lang="ts">
	/**
	 * Scoped period picker for the dashboard's "Expenses by category" chart. One
	 * button opens a listbox of periods; choosing one writes `?month=YYYY-MM` (or
	 * clears it for "All time") and navigates, so the server load re-scopes ONLY
	 * that chart. Mirrors the goto idiom used by FilterBar.svelte.
	 *
	 * Accessibility notes, because this replaces a native <select> and therefore has
	 * to re-supply everything the platform used to give us for free:
	 *  • The disclosure mechanics (aria-expanded trigger, absolutely-positioned
	 *    panel, Escape-closes-and-restores-focus, outside-click close) are the same
	 *    ones MultiSelect.svelte uses — see that file for the rationale.
	 *  • MultiSelect's panel is a plain group of checkboxes; this one is a real
	 *    listbox (role="listbox" / role="option" + aria-selected), so assistive tech
	 *    announces position, count and selection the way a <select> did.
	 *  • Focus model is the aria-activedescendant one: DOM focus sits on the
	 *    listbox itself while `activeIndex` moves a virtual cursor between options.
	 *    That keeps a single focus stop, so the arrow keys never escape the panel
	 *    and Escape always has somewhere to return focus to (the trigger).
	 *  • The card this sits in has no visible heading, so the trigger carries a
	 *    visually-hidden label — it is the only accessible name for the control.
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { monthLabel } from '$lib/date';

	let {
		months,
		month
	}: {
		/** Distinct YYYY-MM values that have expense data, newest first */
		months: string[];
		/** Currently applied month, or null for all time */
		month: string | null;
	} = $props();

	/**
	 * "All time" first, then every month with data. The panel is sized to show about
	 * six rows and scrolls past that (max-height below) rather than truncating the
	 * list — an older month must stay reachable, not just recent ones.
	 */
	const options = $derived([
		{ value: '', label: 'All time' },
		...months.map((m) => ({ value: m, label: monthLabel(m) }))
	]);

	const selectedIndex = $derived(Math.max(0, options.findIndex((o) => o.value === (month ?? ''))));
	const triggerLabel = $derived(options[selectedIndex]?.label ?? 'All time');

	let open = $state(false);
	/** Virtual cursor inside the listbox — the option aria-activedescendant points at. */
	let activeIndex = $state(0);
	let trigger = $state<HTMLButtonElement>();
	let listbox = $state<HTMLDivElement>();
	let root = $state<HTMLDivElement>();

	const baseId = $props.id();
	const listboxId = `${baseId}-listbox`;
	const optionId = (index: number) => `${baseId}-option-${index}`;

	// Opening moves DOM focus onto the listbox; the virtual cursor starts on the
	// current selection, which is what a native <select> does.
	$effect(() => {
		if (open) listbox?.focus({ preventScroll: true });
	});

	function openPanel(index = selectedIndex) {
		activeIndex = index;
		open = true;
	}

	function closePanel() {
		open = false;
		trigger?.focus();
	}

	/** Set/clear URL params and navigate; empty string clears a param. */
	function apply(patch: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(patch)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		const query = params.toString();
		goto(query ? `?${query}` : page.url.pathname, { keepFocus: true, noScroll: true });
	}

	function select(index: number) {
		const option = options[index];
		if (!option) return;
		// Close and hand focus back to the trigger BEFORE navigating: goto's
		// keepFocus preserves whatever is focused at navigation time, and the
		// listbox is about to be unmounted, so the trigger has to own focus first.
		closePanel();
		apply({ month: option.value });
	}

	function moveTo(index: number) {
		activeIndex = Math.min(options.length - 1, Math.max(0, index));
		document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		// Enter/Space are the button's own activation keys; only the arrows need
		// wiring, so a keyboard user can open straight onto a neighbouring option.
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			openPanel();
		}
	}

	function handleListboxKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				moveTo(activeIndex + 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				moveTo(activeIndex - 1);
				break;
			case 'Home':
				event.preventDefault();
				moveTo(0);
				break;
			case 'End':
				event.preventDefault();
				moveTo(options.length - 1);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				select(activeIndex);
				break;
			case 'Escape':
				// Close only the popover — not an enclosing <dialog> or drawer.
				event.stopPropagation();
				event.preventDefault();
				closePanel();
				break;
			case 'Tab':
				// Let focus leave, but don't leave an orphaned panel behind.
				open = false;
				break;
		}
	}

	function handleDocumentClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}
</script>

<svelte:document onclick={handleDocumentClick} />

<div class="period-filter" bind:this={root}>
	<button
		bind:this={trigger}
		class="period-filter__trigger field__input"
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listboxId : undefined}
		onclick={() => (open ? closePanel() : openPanel())}
		onkeydown={handleTriggerKeydown}
	>
		<span class="visually-hidden">Period for expenses by category</span>
		<span class="period-filter__value">{triggerLabel}</span>
		<span class="period-filter__caret" aria-hidden="true">▾</span>
	</button>

	{#if open}
		<div
			bind:this={listbox}
			id={listboxId}
			class="period-filter__panel"
			role="listbox"
			tabindex="-1"
			aria-label="Period for expenses by category"
			aria-activedescendant={optionId(activeIndex)}
			onkeydown={handleListboxKeydown}
		>
			{#each options as option, index (option.value)}
				<!-- svelte-ignore a11y_click_events_have_key_events -- keyboard is handled on the listbox, per the aria-activedescendant model -->
				<div
					id={optionId(index)}
					class="period-filter__option"
					tabindex="-1"
					class:period-filter__option--active={index === activeIndex}
					role="option"
					aria-selected={index === selectedIndex}
					onclick={() => select(index)}
					onmousemove={() => (activeIndex = index)}
				>
					{option.label}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">

	.period-filter {
		position: relative;
		display: inline-block;
		margin-bottom: var(--space-4);

		&__trigger {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-2);
			// WCAG 2.2 SC 2.5.8 — the button is the whole control's target.
			min-height: var(--target-min);
			min-width: 12ch;
			text-align: left;
			cursor: pointer;
		}

		&__value {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__caret {
			color: var(--text-secondary);
			flex-shrink: 0;
		}

		// Panel tokens match MultiSelect's so the two popovers read as one pattern.
		&__panel {
			position: absolute;
			z-index: 10;
			top: calc(100% + var(--space-1));
			left: 0;
			min-width: 100%;
			// ~6 rows; the rest scroll rather than being dropped from the list.
			max-height: 240px;
			overflow-y: auto;
			padding: var(--space-2);
			background: var(--surface-2);
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-md);
			box-shadow: var(--shadow-2);
		}

		&__option {
			display: flex;
			align-items: center;
			min-height: var(--target-min);
			padding: var(--space-1) var(--space-2);
			border-radius: 6px;
			font-size: var(--text-sm);
			white-space: nowrap;
			cursor: pointer;

			&[aria-selected='true'] {
				font-weight: 600;
			}

			// The virtual cursor needs a visible marker of its own: DOM focus stays
			// on the listbox, so the browser never draws a focus ring here.
			&--active {
				background: var(--accent-soft);
				outline: 2px solid var(--focus-ring);
				outline-offset: -2px;
			}
		}
	}
</style>
