<script lang="ts">
	/**
	 * Disclosure-style multi-select: a trigger button opens a panel of native
	 * checkboxes that post as `name` with the form. The panel stays in the DOM
	 * (hidden with CSS) so checked boxes always submit.
	 */
	let {
		options,
		name,
		selected = [],
		label,
		placeholder = 'None selected',
		onChange
	}: {
		options: { id: number; name: string }[];
		/** Form field name each checkbox posts as */
		name: string;
		/** Initially-checked option ids */
		selected?: number[];
		/** Accessible label for the whole control */
		label: string;
		placeholder?: string;
		/** Called with the new selection whenever a checkbox toggles (e.g. to drive a URL filter) */
		onChange?: (ids: number[]) => void;
	} = $props();

	let open = $state(false);
	const panelId = $props.id();
	// svelte-ignore state_referenced_locally -- `selected` intentionally seeds initial state only
	let checkedIds = $state<number[]>([...selected]);
	let trigger = $state<HTMLButtonElement>();
	let root = $state<HTMLDivElement>();
	let searchInput = $state<HTMLInputElement>();
	// Live filter text for narrowing the visible options by name.
	let query = $state('');

	const normalizedQuery = $derived(query.trim().toLowerCase());

	function matchesQuery(option: { name: string }): boolean {
		return option.name.toLowerCase().includes(normalizedQuery);
	}

	const hasMatches = $derived(options.some(matchesQuery));

	// Start unfiltered each time the panel reopens.
	$effect(() => {
		if (!open) query = '';
	});

	// Focus the filter box when the panel opens so the user can type immediately.
	$effect(() => {
		if (open) searchInput?.focus({ preventScroll: true });
	});

	const summary = $derived(
		checkedIds.length === 0
			? placeholder
			: options
					.filter((o) => checkedIds.includes(o.id))
					.map((o) => o.name)
					.join(', ')
	);

	function toggle(id: number) {
		checkedIds = checkedIds.includes(id)
			? checkedIds.filter((c) => c !== id)
			: [...checkedIds, id];
		onChange?.(checkedIds);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			// Close only the popover — not an enclosing <dialog> or drawer.
			event.stopPropagation();
			event.preventDefault();
			open = false;
			trigger?.focus();
		}
	}

	function handleDocumentClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}
</script>

<svelte:document onclick={handleDocumentClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -- Escape-to-close on a wrapper is a standard disclosure pattern -->
<div class="multi-select" bind:this={root} onkeydown={handleKeydown}>
	<button
		bind:this={trigger}
		class="multi-select__trigger field__input"
		type="button"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		<span class="multi-select__summary" class:multi-select__summary--empty={checkedIds.length === 0}>
			{summary}
		</span>
		<span class="multi-select__chevron" aria-hidden="true">▾</span>
	</button>

	<div
		id={panelId}
		class="multi-select__panel"
		class:multi-select__panel--open={open}
		role="group"
		aria-label={label}
		inert={!open}
	>
		{#if options.length === 0}
			<p class="multi-select__empty">No options yet.</p>
		{:else}
			<input
				bind:this={searchInput}
				class="multi-select__search field__input"
				type="text"
				bind:value={query}
				placeholder="Filter…"
				aria-label="Filter options"
			/>
			<!-- Render every option so a checked-but-filtered-out box still submits;
			     non-matching options are hidden with CSS, not unmounted. -->
			{#each options as option (option.id)}
				<label class="multi-select__option" class:multi-select__option--hidden={!matchesQuery(option)}>
					<input
						type="checkbox"
						{name}
						value={option.id}
						checked={checkedIds.includes(option.id)}
						onchange={() => toggle(option.id)}
					/>
					{option.name}
				</label>
			{/each}
			{#if !hasMatches}
				<p class="multi-select__empty">No matches.</p>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	
	.multi-select {
		position: relative;

		&__trigger {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-2);
			width: 100%;
			text-align: left;
			cursor: pointer;
		}

		&__summary {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;

			&--empty {
				color: var(--text-secondary);
			}
		}

		&__chevron {
			color: var(--text-secondary);
			flex-shrink: 0;
		}

		&__panel {
			position: absolute;
			z-index: 10;
			top: calc(100% + var(--space-1));
			left: 0;
			right: 0;
			max-height: 240px;
			overflow-y: auto;
			padding: var(--space-2);
			background: var(--surface-2);
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-md);
			box-shadow: var(--shadow-2);
			visibility: hidden;

			&--open {
				visibility: visible;
			}
		}

		&__search {
			width: 100%;
			margin-bottom: var(--space-2);
			font-size: var(--text-sm);
		}

		&__option {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			padding: var(--space-1) var(--space-2);
			border-radius: 6px;
			font-size: var(--text-sm);
			cursor: pointer;

			&:hover {
				background: var(--accent-soft);
			}

			&--hidden {
				display: none;
			}
		}

		&__empty {
			margin: 0;
			padding: var(--space-1) var(--space-2);
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}
	}
</style>
