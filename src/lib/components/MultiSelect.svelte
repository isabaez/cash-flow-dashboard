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
	// svelte-ignore state_referenced_locally -- `selected` intentionally seeds initial state only
	let checkedIds = $state<number[]>([...selected]);
	let trigger = $state<HTMLButtonElement>();
	let root = $state<HTMLDivElement>();

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

	<div class="multi-select__panel" class:multi-select__panel--open={open} role="group" aria-label={label}>
		{#if options.length === 0}
			<p class="multi-select__empty">No options yet.</p>
		{:else}
			{#each options as option (option.id)}
				<label class="multi-select__option">
					<input
						type="checkbox"
						{name}
						value={option.id}
						checked={checkedIds.includes(option.id)}
						tabindex={open ? undefined : -1}
						onchange={() => toggle(option.id)}
					/>
					{option.name}
				</label>
			{/each}
		{/if}
	</div>
</div>

<style lang="scss">
	@use 'variables' as *;

	.multi-select {
		position: relative;

		&__trigger {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-sm;
			width: 100%;
			text-align: left;
			cursor: pointer;
		}

		&__summary {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;

			&--empty {
				color: $color-text-muted;
			}
		}

		&__chevron {
			color: $color-text-muted;
			flex-shrink: 0;
		}

		&__panel {
			position: absolute;
			z-index: 10;
			top: calc(100% + #{$space-xs});
			left: 0;
			right: 0;
			max-height: 240px;
			overflow-y: auto;
			padding: $space-sm;
			background: $color-surface-raised;
			border: 1px solid $color-border;
			border-radius: $radius;
			box-shadow: $shadow;
			visibility: hidden;

			&--open {
				visibility: visible;
			}
		}

		&__option {
			display: flex;
			align-items: center;
			gap: $space-sm;
			padding: $space-xs $space-sm;
			border-radius: 6px;
			font-size: $text-sm;
			cursor: pointer;

			&:hover {
				background: rgba(124, 154, 255, 0.1);
			}
		}

		&__empty {
			margin: 0;
			padding: $space-xs $space-sm;
			color: $color-text-muted;
			font-size: $text-sm;
		}
	}
</style>
