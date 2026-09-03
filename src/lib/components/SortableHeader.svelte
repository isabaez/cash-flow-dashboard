<script lang="ts" generics="Key extends string">
	/**
	 * A sortable column header. Extracted from the Funds table, where this markup was
	 * repeated seven times.
	 *
	 * `aria-sort` goes on the <th> (that is what assistive tech reads); the button
	 * inside carries the click target and the visual arrow.
	 */
	let {
		label,
		sortKey,
		activeKey,
		direction,
		align = 'start',
		onsort
	}: {
		label: string;
		sortKey: Key;
		activeKey: Key;
		direction: 'asc' | 'desc';
		align?: 'start' | 'end';
		onsort: (key: Key) => void;
	} = $props();

	const active = $derived(activeKey === sortKey);
	const ariaSort = $derived(
		active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined
	);
	const arrow = $derived(active ? (direction === 'asc' ? '▲' : '▼') : '↕');
</script>

<th scope="col" aria-sort={ariaSort} class:table__cell--number={align === 'end'}>
	<button
		class="sort-button sort-button--{align}"
		class:sort-button--active={active}
		type="button"
		onclick={() => onsort(sortKey)}
	>
		{label}
		<span class="sort-button__arrow" aria-hidden="true">{arrow}</span>
	</button>
</th>

<style lang="scss">
	.sort-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
		transition: color var(--dur-fast) var(--ease-out);

		&:hover {
			color: var(--text-primary);
		}

		&--active {
			color: var(--text-primary);
		}

		&--end {
			width: 100%;
			justify-content: flex-end;
		}

		&__arrow {
			font-size: 0.65em;
			opacity: 0.75;
		}
	}
</style>
