<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		descriptionId,
		children
	}: {
		open?: boolean;
		title: string;
		/** Id of an element in the content that describes the dialog, read out when it opens. */
		descriptionId?: string;
		children: Snippet;
	} = $props();

	// The visible title names the dialog (aria-labelledby).
	const titleId = $props.id();

	let dialog = $state<HTMLDialogElement>();

	// Whatever had focus when the dialog opened: focus goes back there on close.
	let opener: Element | null = null;

	// Keep the native <dialog> in sync with the `open` state. The content renders only
	// while open, so a caller's `autofocus` field exists when showModal() looks for it —
	// and never lingers in a closed dialog, where SvelteKit's focus reset after
	// navigation and form actions would pick it (it focuses any `[autofocus]` it finds).
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			opener = document.activeElement;
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
			restoreFocus();
		}
	});

	// Closing a modal <dialog> returns focus to the opener by itself. Two cases need
	// help: a close that bypassed that (focus is left on <body>), and an opener that a
	// submit removed (a deleted row, an empty state that filled), where focus moves to
	// <main> instead. Runs from the effect and from `onclose`; whichever comes first wins.
	function restoreFocus() {
		const returnTo = opener;
		opener = null;
		if (!(returnTo instanceof HTMLElement) || returnTo === document.body) return;
		const focused = document.activeElement;
		if (focused && focused !== document.body) return;
		if (returnTo.isConnected) returnTo.focus();
		else focusMain();
	}

	// As GOV.UK's skip link does: <main> takes a tabindex only while it holds focus,
	// and global.scss hides the ring on it, since it is a region, not a control.
	function focusMain() {
		const main = dialog?.closest<HTMLElement>('.js-focus-fallback');
		if (!main) return;
		main.tabIndex = -1;
		main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
		main.focus({ preventScroll: true });
	}

	// Close when the backdrop (the dialog element itself) is clicked.
	function handleClick(event: MouseEvent) {
		if (event.target === dialog) open = false;
	}

	// Explicit Escape fallback alongside the native <dialog> cancel behavior.
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby={titleId}
	aria-describedby={descriptionId}
	onclose={() => {
		open = false;
		restoreFocus();
	}}
	onclick={handleClick}
	onkeydown={handleKeydown}
>
	<div class="modal__panel">
		<div class="modal__header">
			<h2 class="modal__title" id={titleId}>{title}</h2>
			<button class="modal__close" type="button" aria-label="Close" onclick={() => (open = false)}>
				<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
					<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
			</button>
		</div>
		{#if open}
			{@render children()}
		{/if}
	</div>
</dialog>

<style lang="scss">
	
	.modal {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 0;
		width: min(620px, calc(100vw - var(--space-5) * 2));
		background: var(--surface-1);
		color: var(--text-primary);
		box-shadow: var(--shadow-3);

		&[open] {
			animation: modal-in var(--dur-base) var(--ease-out);
		}

		&::backdrop {
			background: var(--scrim);
		}

		&__panel {
			padding: var(--space-5);
		}

		&__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
			margin-bottom: var(--space-5);
		}

		&__title {
			margin: 0;
			font-size: var(--text-md);
			font-weight: 600;
		}

		&__close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			inline-size: 30px;
			block-size: 30px;
			background: none;
			border: none;
			border-radius: var(--radius-md);
			cursor: pointer;
			color: var(--text-tertiary);
			transition:
				color var(--dur-fast) var(--ease-out),
				background-color var(--dur-fast) var(--ease-out);

			&:hover {
				color: var(--text-primary);
				background: var(--surface-2);
			}

			svg {
				inline-size: 15px;
				block-size: 15px;
			}
		}
	}

	// The global prefers-reduced-motion rule collapses this to ~0ms.
	@keyframes modal-in {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.99);
		}
	}
</style>
