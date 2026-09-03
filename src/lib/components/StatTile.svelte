<script lang="ts">
	/**
	 * A headline figure — the "verdict first" element of the dashboard.
	 *
	 * The delta carries an arrow glyph and a signed number as well as colour, so the
	 * direction survives greyscale and colour-vision deficiency (WCAG 2.2 SC 1.4.1).
	 */
	import Sparkline from '$lib/components/Sparkline.svelte';

	let {
		label,
		value,
		delta = null,
		deltaLabel = '',
		/** Which direction is good. Spending going up is bad; net worth going up is good. */
		polarity = 'up-is-good',
		trend = [],
		hint = ''
	}: {
		label: string;
		/** Pre-formatted, e.g. formatCents(…) or "42.1%". */
		value: string;
		/** Signed change. null renders no chip (e.g. the first month on record). */
		delta?: number | null;
		/** Pre-formatted magnitude, e.g. "$1,204" or "3.2 pts". */
		deltaLabel?: string;
		polarity?: 'up-is-good' | 'down-is-good';
		trend?: (number | null)[];
		hint?: string;
	} = $props();

	const direction = $derived(delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down');
	const tone = $derived.by(() => {
		if (direction === 'flat') return 'neutral';
		const good = polarity === 'up-is-good' ? direction === 'up' : direction === 'down';
		return good ? 'positive' : 'negative';
	});
	const arrow = $derived(direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→');
</script>

<div class="stat-tile">
	<span class="stat-tile__label">{label}</span>
	<strong class="stat-tile__value money">{value}</strong>

	<div class="stat-tile__foot">
		{#if delta !== null}
			<span class="stat-tile__delta stat-tile__delta--{tone}">
				<span aria-hidden="true">{arrow}</span>
				<span class="money">{deltaLabel}</span>
				{#if hint}<span class="stat-tile__hint">{hint}</span>{/if}
			</span>
		{:else if hint}
			<span class="stat-tile__hint">{hint}</span>
		{/if}

		{#if trend.length > 1}
			<div class="stat-tile__spark"><Sparkline values={trend} {tone} /></div>
		{/if}
	</div>
</div>

<style lang="scss">
	.stat-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-1);

		&__label {
			font-size: var(--text-sm);
			font-weight: 500;
			color: var(--text-secondary);
		}

		&__value {
			font-size: var(--text-2xl);
			font-weight: 650;
			line-height: 1.1;
			letter-spacing: -0.03em;
			color: var(--text-primary);
		}

		&__foot {
			display: flex;
			align-items: flex-end;
			justify-content: space-between;
			gap: var(--space-4);
			margin-top: auto;
			padding-top: var(--space-1);
		}

		&__delta {
			display: inline-flex;
			align-items: baseline;
			gap: var(--space-1);
			font-size: var(--text-sm);
			font-weight: 550;
			white-space: nowrap;

			&--positive {
				color: var(--pos);
			}

			&--negative {
				color: var(--neg);
			}

			&--neutral {
				color: var(--text-tertiary);
			}
		}

		&__hint {
			color: var(--text-tertiary);
			font-weight: 400;
		}

		&__spark {
			flex: 0 1 96px;
			min-width: 56px;
		}
	}
</style>
