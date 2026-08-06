<script lang="ts">
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
</script>

{#if onclick}
	<button
		class="category-tag category-tag--clickable"
		type="button"
		style="--tag-color: {color}"
		title="Filter by {name}"
		{onclick}
	>
		{name}
	</button>
{:else}
	<span class="category-tag" style="--tag-color: {color}">
		{name}
		{#if onremove}
			<button
				class="category-tag__remove"
				type="button"
				aria-label="Remove {name} filter"
				onclick={onremove}
			>
				×
			</button>
		{/if}
	</span>
{/if}

<style lang="scss">
	@use 'variables' as *;

	.category-tag {
		display: inline-flex;
		align-items: center;
		gap: $space-xs;
		padding: 0.1rem $space-sm;
		border-radius: $radius;
		font-size: $text-sm;
		white-space: nowrap;
		// Tinted like the funds ledger badges, keyed off each category's color.
		color: var(--tag-color);
		background: color-mix(in srgb, var(--tag-color) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);

		&--clickable {
			font-family: inherit;
			cursor: pointer;

			&:hover {
				background: color-mix(in srgb, var(--tag-color) 28%, transparent);
			}
		}

		&__remove {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 0;
			width: 1.05rem;
			height: 1.05rem;
			border: none;
			border-radius: 50%;
			background: transparent;
			color: inherit;
			font-size: 1rem;
			line-height: 1;
			cursor: pointer;

			&:hover {
				background: color-mix(in srgb, var(--tag-color) 30%, transparent);
			}
		}
	}
</style>
