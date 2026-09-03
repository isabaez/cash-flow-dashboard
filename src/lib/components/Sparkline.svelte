<script lang="ts">
	/**
	 * Inline trend line for a stat tile. Dependency-free SVG — Chart.js would be
	 * heavy for a 12-point line with no axes, and this needs no canvas.
	 *
	 * aria-hidden by design: the tile's value and delta already state the trend in
	 * words, so announcing the shape again adds nothing.
	 */
	let {
		values,
		tone = 'neutral'
	}: {
		values: (number | null)[];
		tone?: 'positive' | 'negative' | 'neutral';
	} = $props();

	const WIDTH = 100;
	const HEIGHT = 28;

	const points = $derived(values.filter((v): v is number => v !== null));

	const path = $derived.by(() => {
		if (points.length < 2) return '';
		const min = Math.min(...points);
		const max = Math.max(...points);
		// A flat series would divide by zero; draw it down the middle instead.
		const span = max - min || 1;
		const step = WIDTH / (points.length - 1);
		return points
			.map((value, i) => {
				const x = i * step;
				const y = HEIGHT - ((value - min) / span) * (HEIGHT - 4) - 2;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	});
</script>

{#if path}
	<svg
		class="sparkline sparkline--{tone}"
		viewBox="0 0 {WIDTH} {HEIGHT}"
		preserveAspectRatio="none"
		aria-hidden="true"
		focusable="false"
	>
		<path d={path} fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
{/if}

<style>
	.sparkline {
		display: block;
		width: 100%;
		height: 28px;
		overflow: visible;
	}

	.sparkline--positive {
		color: var(--pos);
	}

	.sparkline--negative {
		color: var(--neg);
	}

	.sparkline--neutral {
		color: var(--text-tertiary);
	}
</style>
