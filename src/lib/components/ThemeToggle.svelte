<script lang="ts">
	/**
	 * Three-state theme control. Native radios inside a fieldset rather than a single
	 * icon button: "follow my OS" is a real state, and a two-state toggle cannot
	 * express it or announce which of the three is active.
	 */
	import { theme, type ThemePreference } from '$lib/theme.svelte';

	const options: { value: ThemePreference; label: string; icon: string }[] = [
		{ value: 'light', label: 'Light', icon: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
		{ value: 'dark', label: 'Dark', icon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z' },
		{ value: 'system', label: 'System', icon: 'M3 5.5h18v10H3zM8.5 20h7m-3.5-4.5V20' }
	];
</script>

<fieldset class="theme-toggle">
	<legend class="visually-hidden">Colour theme</legend>
	{#each options as option (option.value)}
		<label class="theme-toggle__option" class:theme-toggle__option--on={theme.preference === option.value}>
			<input
				class="visually-hidden"
				type="radio"
				name="theme"
				value={option.value}
				checked={theme.preference === option.value}
				onchange={() => theme.set(option.value)}
			/>
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path d={option.icon} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span class="visually-hidden">{option.label}</span>
		</label>
	{/each}
</fieldset>

<style lang="scss">
	.theme-toggle {
		display: flex;
		gap: 2px;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		background: var(--surface-2);

		&__option {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			inline-size: 30px;
			block-size: 30px;
			border-radius: var(--radius-full);
			color: var(--text-tertiary);
			cursor: pointer;
			transition:
				background-color var(--dur-fast) var(--ease-out),
				color var(--dur-fast) var(--ease-out);

			&:hover {
				color: var(--text-primary);
			}

			// The visually-hidden radio still takes focus; mirror its ring onto the label.
			&:has(input:focus-visible) {
				outline: 2px solid var(--focus-ring);
				outline-offset: 2px;
			}

			&--on {
				background: var(--surface-0);
				color: var(--text-primary);
				box-shadow: var(--shadow-1);
			}

			svg {
				inline-size: 15px;
				block-size: 15px;
			}
		}
	}
</style>
