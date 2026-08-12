<script lang="ts">
	// Scoped period filter for the dashboard's "Expenses by category" chart. Writes
	// month / year / from+to search params and navigates; the server load re-runs and
	// re-scopes ONLY that chart. Modes are mutually exclusive — picking one clears the
	// others. Mirrors the goto idiom used by FilterBar.svelte.
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { monthLabel } from '$lib/date';

	let {
		months,
		years,
		month,
		year,
		from,
		to
	}: {
		/** Distinct YYYY-MM values that have expense data */
		months: string[];
		/** Distinct YYYY values that have expense data */
		years: string[];
		month: string | null;
		year: string | null;
		from: string | null;
		to: string | null;
	} = $props();

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

<div class="period-filter">
	<label class="period-filter__field">
		<span class="period-filter__label">Month</span>
		<select
			class="field__input"
			value={month ?? ''}
			onchange={(e) => apply({ month: e.currentTarget.value, year: '', from: '', to: '' })}
		>
			<option value="">All</option>
			{#each months as m}
				<option value={m}>{monthLabel(m)}</option>
			{/each}
		</select>
	</label>

	<label class="period-filter__field">
		<span class="period-filter__label">Year</span>
		<select
			class="field__input"
			value={year ?? ''}
			onchange={(e) => apply({ year: e.currentTarget.value, month: '', from: '', to: '' })}
		>
			<option value="">All</option>
			{#each years as y}
				<option value={y}>{y}</option>
			{/each}
		</select>
	</label>

	<label class="period-filter__field">
		<span class="period-filter__label">From</span>
		<select
			class="field__input"
			value={from ?? ''}
			onchange={(e) => apply({ from: e.currentTarget.value, month: '', year: '' })}
		>
			<option value="">—</option>
			{#each months as m}
				<option value={m}>{monthLabel(m)}</option>
			{/each}
		</select>
	</label>

	<label class="period-filter__field">
		<span class="period-filter__label">To</span>
		<select
			class="field__input"
			value={to ?? ''}
			onchange={(e) => apply({ to: e.currentTarget.value, month: '', year: '' })}
		>
			<option value="">—</option>
			{#each months as m}
				<option value={m}>{monthLabel(m)}</option>
			{/each}
		</select>
	</label>
</div>

<style lang="scss">
	@use 'variables' as *;

	.period-filter {
		display: flex;
		flex-wrap: wrap;
		gap: $space-sm $space-md;
		margin-bottom: $space-md;

		&__field {
			display: flex;
			align-items: center;
			gap: $space-sm;
		}

		&__label {
			font-size: $text-sm;
			font-weight: 500;
			color: $color-text-muted;
			white-space: nowrap;
		}
	}
</style>
