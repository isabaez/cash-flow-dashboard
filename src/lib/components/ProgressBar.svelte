<script lang="ts">
	// Simple determinate progress bar. `value` is a 0–100 percentage.
	let { value = 0, label }: { value?: number; label?: string } = $props();

	const clamped = $derived(Math.max(0, Math.min(100, value)));
	const complete = $derived(clamped >= 100);
</script>

<div
	class="progress"
	role="progressbar"
	aria-valuenow={Math.round(clamped)}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-label={label ?? 'Progress'}
>
	<div class="progress__fill" class:progress__fill--complete={complete} style:width="{clamped}%"></div>
</div>

<style lang="scss">
	
	.progress {
		width: 100%;
		height: 0.5rem;
		background: var(--surface-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		overflow: hidden;

		&__fill {
			height: 100%;
			background: var(--accent);
			border-radius: inherit;
			transition:
				width 0.2s ease,
				background 0.2s ease;

			&--complete {
				background: var(--pos);
			}
		}
	}
</style>
