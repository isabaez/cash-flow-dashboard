<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
	import { applyCategoryFilters } from '$lib/filters';

	let {
		months,
		years,
		month,
		year,
		categories = null,
		categoryIds = []
	}: {
		/** Distinct YYYY-MM values that have data */
		months: string[];
		/** Distinct YYYY values that have data */
		years: string[];
		month: string | null;
		year: string | null;
		categories?: { id: number; name: string }[] | null;
		/** Currently-applied category filter ids (AND) */
		categoryIds?: number[];
	} = $props();

	const MONTH_NAMES = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	function monthLabel(value: string): string {
		const [yearPart, monthPart] = value.split('-');
		return `${MONTH_NAMES[Number(monthPart) - 1] ?? monthPart} ${yearPart}`;
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
</script>

<div class="filter-bar">
	<label class="filter-bar__filter">
		<span class="filter-bar__label">Month</span>
		<select
			class="field__input"
			value={month ?? ''}
			onchange={(event) => apply({ month: event.currentTarget.value, year: '' })}
		>
			<option value="">All</option>
			{#each months as monthOption}
				<option value={monthOption}>{monthLabel(monthOption)}</option>
			{/each}
		</select>
	</label>

	<label class="filter-bar__filter">
		<span class="filter-bar__label">Year</span>
		<select
			class="field__input"
			value={year ?? ''}
			onchange={(event) => apply({ year: event.currentTarget.value, month: '' })}
		>
			<option value="">All</option>
			{#each years as yearOption}
				<option value={yearOption}>{yearOption}</option>
			{/each}
		</select>
	</label>

	{#if categories}
		<div class="filter-bar__filter filter-bar__filter--category">
			<span class="filter-bar__label">Category</span>
			<!-- Remount when the applied set changes so the checkboxes stay in sync
			     with filters removed elsewhere (row tags, applied-filters bar). -->
			{#key categoryIds.join(',')}
				<MultiSelect
					options={categories}
					name="category"
					selected={categoryIds}
					label="Filter by categories"
					placeholder="All"
					onChange={(ids) => applyCategoryFilters(page.url, ids)}
				/>
			{/key}
		</div>
	{/if}
</div>

<style lang="scss">
	
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-bottom: var(--space-4);

		&__filter {
			display: flex;
			align-items: center;
			gap: var(--space-2);
		}

		&__filter--category {
			min-width: 240px;

			:global(.multi-select) {
				flex: 1;
			}
		}

		&__label {
			font-size: var(--text-sm);
			font-weight: 500;
			color: var(--text-secondary);
			white-space: nowrap;
		}
	}
</style>
