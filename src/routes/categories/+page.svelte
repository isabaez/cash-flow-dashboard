<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import CategoryTag from '$lib/components/CategoryTag.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Category = (typeof data.categories)[number];

	// Which modal is open, and for which category. One value so two can never be
	// open at once.
	let modal = $state<{ kind: 'add' | 'edit' | 'delete'; category: Category | null } | null>(
		null
	);
	// Fresh default color for the add form (regenerated each open).
	let newColor = $state('#7c9aff');

	// --- Live search -------------------------------------------------------
	// Seeded from `?q=` so a filtered view is linkable, then kept in the URL with a
	// shallow `replaceState` — no load re-run and no history entry per keystroke.
	let query = $state(page.url.searchParams.get('q') ?? '');

	const needle = $derived(query.trim().toLowerCase());
	const visible = $derived(
		needle === '' ? data.categories : data.categories.filter((c) => c.name.toLowerCase().includes(needle))
	);

	function syncQuery() {
		const url = new URL(page.url);
		if (query.trim()) url.searchParams.set('q', query.trim());
		else url.searchParams.delete('q');
		replaceState(url, page.state);
	}

	function clearQuery() {
		query = '';
		syncQuery();
	}

	// --- Modals -------------------------------------------------------------
	// Bright, saturated color so the tag reads on the dark surface.
	function randomColor(): string {
		const h = Math.floor(Math.random() * 360);
		const s = 0.6 + Math.random() * 0.3;
		const l = 0.55 + Math.random() * 0.15;
		const a = s * Math.min(l, 1 - l);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
			return Math.round(255 * c)
				.toString(16)
				.padStart(2, '0');
		};
		return `#${f(0)}${f(8)}${f(4)}`;
	}

	function openAdd() {
		newColor = randomColor();
		modal = { kind: 'add', category: null };
	}

	function closeModal() {
		modal = null;
	}

	function otherCategories(id: number) {
		return data.categories.filter((c) => c.id !== id);
	}

	// Close the modal only once the action succeeds; a validation failure keeps it
	// open with the server's message inside it.
	const closeOnSuccess = () =>
		async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			await update();
			if (result.type === 'success') modal = null;
		};
</script>

<svelte:head>
	<title>Categories · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<h1>Categories</h1>
	<button class="button" type="button" onclick={openAdd}>Add category</button>
</div>

<!-- Each modal repeats the error inside itself, so the page-level copy only shows
     when none is open. -->
{#if form?.error && !modal}
	<p class="form-error" role="alert">{form.error}</p>
{/if}

<Modal
	bind:open={() => modal?.kind === 'add', (open) => !open && closeModal()}
	title="New category"
>
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	{#key modal?.kind === 'add'}
		<form class="category-form" method="POST" action="?/create" use:enhance={closeOnSuccess}>
			<div class="field">
				<label class="field__label" for="new-name">Name</label>
				<input class="field__input" id="new-name" name="name" required placeholder="e.g. Groceries" />
			</div>
			<div class="field field--color">
				<label class="field__label" for="new-color">Color</label>
				<input class="color-input" type="color" id="new-color" name="color" bind:value={newColor} />
			</div>
			<button class="button" type="submit">Add</button>
		</form>
	{/key}
</Modal>

<Modal
	bind:open={() => modal?.kind === 'edit', (open) => !open && closeModal()}
	title="Edit category"
>
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	<!-- Keyed on the open flag too: the post-save form reset empties the DOM inputs,
	     so reopening the same category must remount the form with fresh values. -->
	{#key `${modal?.kind}-${modal?.category?.id}`}
		{#if modal?.kind === 'edit' && modal.category}
			<form class="category-form" method="POST" action="?/update" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={modal.category.id} />
				<div class="field">
					<label class="field__label" for="edit-name">Name</label>
					<input
						class="field__input"
						id="edit-name"
						name="name"
						required
						value={modal.category.name}
					/>
				</div>
				<div class="field field--color">
					<label class="field__label" for="edit-color">Color</label>
					<input
						class="color-input"
						type="color"
						id="edit-color"
						name="color"
						value={modal.category.color}
					/>
				</div>
				<button class="button" type="submit">Save</button>
			</form>
		{/if}
	{/key}
</Modal>

<Modal
	bind:open={() => modal?.kind === 'delete', (open) => !open && closeModal()}
	title="Delete category"
>
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	{#key `${modal?.kind}-${modal?.category?.id}`}
		{#if modal?.kind === 'delete' && modal.category}
			{@const category = modal.category}
			<form class="delete-form" method="POST" action="?/delete" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={category.id} />
				<p class="delete-form__lede">
					Delete <CategoryTag name={category.name} color={category.color} />?
					{#if category.expenseCount === 0}
						No expenses use it.
					{:else}
						{category.expenseCount}
						{category.expenseCount === 1 ? 'expense uses' : 'expenses use'} it.
					{/if}
				</p>
				{#if category.expenseCount > 0}
					<div class="field">
						<label class="field__label" for="replacement">Move its expenses to</label>
						<select class="field__input" id="replacement" name="replacementId">
							<option value="">Nothing — just remove the tag</option>
							{#each otherCategories(category.id) as other (other.id)}
								<option value={other.id}>{other.name}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="delete-form__actions">
					<button class="button button--secondary" type="button" onclick={closeModal}>
						Cancel
					</button>
					<button class="button button--danger" type="submit">Delete category</button>
				</div>
			</form>
		{/if}
	{/key}
</Modal>

<div class="card">
	{#if data.categories.length === 0}
		<div class="empty-state">
			<p class="empty-state__title">No categories yet.</p>
			<p class="empty-state__hint">
				Categories tag expenses so the Dashboard can break spending down.
			</p>
			<div class="empty-state__actions">
				<button class="button" type="button" onclick={openAdd}>Add category</button>
			</div>
		</div>
	{:else}
		<div class="search" role="search">
			<label class="visually-hidden" for="category-search">Search categories</label>
			<svg class="search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path
					d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<input
				class="field__input search__input"
				id="category-search"
				type="search"
				placeholder="Search categories"
				autocomplete="off"
				spellcheck="false"
				bind:value={query}
				oninput={syncQuery}
				aria-controls="category-list"
			/>
		</div>

		<!-- Announced politely as the filter narrows, so a screen-reader user hears the
		     result without the list itself being re-read. -->
		<p class="search__count" role="status">
			{#if needle}
				{visible.length} of {data.categories.length} categories
			{:else}
				{data.categories.length} categories
			{/if}
		</p>

		{#if visible.length === 0}
			<div class="empty-state">
				<p class="empty-state__title">No categories match “{query.trim()}”.</p>
				<div class="empty-state__actions">
					<button class="link-action" type="button" onclick={clearQuery}>Clear search</button>
				</div>
			</div>
		{:else}
			<ul class="tag-cloud" id="category-list" aria-label="Categories">
				{#each visible as category (category.id)}
					<li class="tag-cloud__item">
						<CategoryTag
							name={category.name}
							color={category.color}
							count={category.expenseCount}
							size="md"
						/>
						<div class="tag-cloud__actions">
							<button
								class="corner-action"
								type="button"
								aria-label="Edit {category.name}"
								title="Edit {category.name}"
								onclick={() => (modal = { kind: 'edit', category })}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
									<path
										d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
										fill="none"
										stroke="currentColor"
										stroke-width="1.7"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
							<button
								class="corner-action corner-action--danger"
								type="button"
								aria-label="Delete {category.name}"
								title="Delete {category.name}"
								onclick={() => (modal = { kind: 'delete', category })}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
									<path
										d="M4 7h16M10 7V5h4v2m-8 0 1 13h10l1-13M10 11v6M14 11v6"
										fill="none"
										stroke="currentColor"
										stroke-width="1.7"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style lang="scss">
	.category-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);

		.field {
			flex: 1;
			margin-bottom: 0;
		}

		.field--color {
			flex: 0 0 auto;
		}
	}

	.delete-form {
		&__lede {
			margin: 0 0 var(--space-4);
			line-height: 1.8;
		}

		&__actions {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			gap: var(--space-4);
			margin-top: var(--space-4);
		}
	}

	.color-input {
		width: 2.75rem;
		height: 2.6rem;
		padding: 2px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		cursor: pointer;
	}

	.form-error {
		margin: 0 0 var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid color-mix(in oklab, var(--neg) 40%, transparent);
		border-left: 3px solid var(--neg);
		border-radius: var(--radius-md);
		background: var(--neg-soft);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	// --- Search ------------------------------------------------------------
	.search {
		position: relative;
		max-inline-size: 28rem;

		&__icon {
			position: absolute;
			inset-block-start: 50%;
			inset-inline-start: var(--space-3);
			inline-size: 16px;
			block-size: 16px;
			translate: 0 -50%;
			color: var(--text-tertiary);
			pointer-events: none;
		}

		&__input {
			inline-size: 100%;
			padding-inline-start: calc(var(--space-3) + 16px + var(--space-2));
		}

		&__count {
			margin: var(--space-2) 0 var(--space-5);
			color: var(--text-secondary);
			font-size: var(--text-sm);
			font-variant-numeric: tabular-nums;
		}
	}

	// --- Tag cloud ---------------------------------------------------------
	// Left-to-right, wrapping top-down. The row gap is sized for the corner actions,
	// which hang ~half a target above each tag and must not land on the row above.
	.tag-cloud {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5) var(--space-4);
		margin: 0;
		padding: var(--space-3) var(--space-3) 0 0;
		list-style: none;

		&__item {
			position: relative;
			display: inline-flex;

			// Lift the hovered/focused tag so its hanging actions sit over neighbours.
			&:hover,
			&:focus-within {
				z-index: 1;
			}
		}

		// Positioned off the tag's top-right corner, not contained by it. Revealed on
		// hover and on keyboard focus anywhere in the item.
		&__actions {
			position: absolute;
			inset-block-start: calc(var(--target-min) / -2);
			inset-inline-end: calc(var(--target-min) / -2);
			display: flex;
			gap: 2px;
			opacity: 0;
			pointer-events: none;
			transition: opacity var(--dur-fast) var(--ease-out);
		}

		&__item:hover &__actions,
		&__item:focus-within &__actions {
			opacity: 1;
			pointer-events: auto;
		}

		// Without hover there is nothing to reveal them, and pinned over every tag
		// they would cover short names — so on touch they sit inline after the tag.
		// Nothing hangs above a tag then, so the row gap no longer needs the room.
		@media (hover: none) {
			gap: var(--space-3);
			padding: 0;

			&__actions {
				position: static;
				margin-inline-start: var(--space-1);
				align-self: center;
				opacity: 1;
				pointer-events: auto;
			}
		}
	}

	.corner-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--target-min);
		block-size: var(--target-min);
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		box-shadow: var(--shadow-1);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			background-color var(--dur-fast) var(--ease-out);

		&:hover {
			color: var(--text-primary);
			background: var(--surface-3);
		}

		&--danger:hover {
			color: var(--neg);
		}

		svg {
			inline-size: 13px;
			block-size: 13px;
		}
	}
</style>
