<script lang="ts">
	import { readableOn } from '$lib/color';
	import { theme } from '$lib/theme.svelte';

	let {
		name,
		color,
		onclick = null,
		onremove = null
	}: {
		name: string;
		color: string;
		/** When set, the whole tag is a button (e.g. click to filter). */
		onclick?: (() => void) | null;
		/** When set, an inline × button is shown (e.g. remove an applied filter). */
		onremove?: (() => void) | null;
	} = $props();

	// Category colours are user-chosen and unconstrained, so the raw value can be
	// unreadable on one theme or the other. The tint and border keep the chosen
	// colour; only the label text is clamped to a readable lightness.
	const ink = $derived(readableOn(color, theme.resolved));
</script>

{#if onclick}
	<button
		class="category-tag category-tag--clickable"
		type="button"
		style="--tag-color: {color}; --tag-ink: {ink}"
		title="Filter by {name}"
		{onclick}
	>
		{name}
	</button>
{:else}
	<span class="category-tag" style="--tag-color: {color}; --tag-ink: {ink}">
		{name}
		{#if onremove}
			<button
				class="category-tag__remove"
				type="button"
				aria-label="Remove {name} filter"
				onclick={onremove}
			>
				<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
					<path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
			</button>
		{/if}
	</span>
{/if}

<style lang="scss">
	.category-tag {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.1rem var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
		color: var(--tag-ink);
		background: color-mix(in oklab, var(--tag-color) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--tag-color) 32%, transparent);

		&--clickable {
			font-family: inherit;
			// Clickable tags sit in a row of tags; the 24px floor applies.
			min-height: var(--target-min);
			cursor: pointer;
			transition: background-color var(--dur-fast) var(--ease-out);

			&:hover {
				background: color-mix(in oklab, var(--tag-color) 26%, transparent);
			}
		}

		&__remove {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 0;
			// Meets WCAG 2.2 SC 2.5.8; the icon inside stays small.
			inline-size: var(--target-min);
			block-size: var(--target-min);
			margin-inline-end: calc(-1 * var(--space-1));
			border: none;
			border-radius: var(--radius-full);
			background: transparent;
			color: inherit;
			cursor: pointer;

			&:hover {
				background: color-mix(in oklab, var(--tag-color) 30%, transparent);
			}

			svg {
				inline-size: 11px;
				block-size: 11px;
			}
		}
	}
</style>
