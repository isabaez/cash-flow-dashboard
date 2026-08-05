<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		children
	}: { open?: boolean; title: string; children: Snippet } = $props();

	let dialog = $state<HTMLDialogElement>();

	// Keep the native <dialog> in sync with the `open` state.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// Close when the backdrop (the dialog element itself) is clicked.
	function handleClick(event: MouseEvent) {
		if (event.target === dialog) open = false;
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => (open = false)} onclick={handleClick}>
	<div class="modal__panel">
		<div class="modal__header">
			<h2 class="modal__title">{title}</h2>
			<button class="modal__close" type="button" aria-label="Close" onclick={() => (open = false)}>
				&times;
			</button>
		</div>
		{@render children()}
	</div>
</dialog>

<style lang="scss">
	@use 'variables' as *;

	.modal {
		border: none;
		border-radius: $radius;
		padding: 0;
		width: min(620px, calc(100vw - #{$space-lg} * 2));
		background: $color-surface;
		color: $color-text;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);

		&::backdrop {
			background: rgba(0, 0, 0, 0.4);
		}

		&__panel {
			padding: $space-lg;
		}

		&__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: $space-md;
		}

		&__title {
			margin: 0;
			font-size: $text-lg;
		}

		&__close {
			background: none;
			border: none;
			font-size: 1.5rem;
			line-height: 1;
			cursor: pointer;
			color: $color-text-muted;
			padding: 0 $space-xs;

			&:hover {
				color: $color-text;
			}
		}
	}
</style>
