<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import CategoryTag from '$lib/components/CategoryTag.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Whether the "add category" modal is open
	let showAddModal = $state(false);
	// Category id currently pending deletion (shows the replacement picker)
	let deletingId = $state<number | null>(null);
	// Category id currently being renamed
	let editingId = $state<number | null>(null);
	// Fresh default color for the add form (regenerated each open).
	let newColor = $state('#7c9aff');

	function otherCategories(id: number) {
		return data.categories.filter((c) => c.id !== id);
	}

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
		showAddModal = true;
	}
</script>

<div class="page-header">
	<h1>Categories</h1>
	<button class="button" type="button" onclick={openAdd}>Add category</button>
</div>

{#if form?.error}
	<p class="form-error">{form.error}</p>
{/if}

<Modal bind:open={showAddModal} title="New category">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	{#key showAddModal}
		<form
			class="category-form"
			method="POST"
			action="?/create"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showAddModal = false;
				}}
		>
			<div class="field">
				<label class="field__label" for="name">Name</label>
				<input class="field__input" id="name" name="name" required placeholder="e.g. Groceries" />
			</div>
			<div class="field field--color">
				<label class="field__label" for="color">Color</label>
				<input class="color-input" type="color" id="color" name="color" bind:value={newColor} />
			</div>
			<button class="button" type="submit">Add</button>
		</form>
	{/key}
</Modal>

<div class="card">
	{#if data.categories.length === 0}
		<p class="empty-state">No categories yet.</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th>Name</th>
					<th class="table__cell--number">Expenses</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.categories as category (category.id)}
					<tr>
						<td>
							{#if editingId === category.id}
								<form
									class="rename-form"
									method="POST"
									action="?/update"
									use:enhance={() =>
										({ update }) => {
											editingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={category.id} />
									<input
										class="color-input"
										type="color"
										name="color"
										value={category.color}
										aria-label="Category color"
									/>
									<input
										class="field__input"
										name="name"
										required
										value={category.name}
										aria-label="Category name"
									/>
									<button class="button" type="submit">Save</button>
									<button
										class="link-action"
										type="button"
										onclick={() => (editingId = null)}
									>
										Cancel
									</button>
								</form>
							{:else}
								<CategoryTag name={category.name} color={category.color} />
							{/if}
						</td>
						<td class="table__cell--number">{category.expenseCount}</td>
						<td>
							{#if deletingId === category.id}
								<form
									class="delete-form"
									method="POST"
									action="?/delete"
									use:enhance={() =>
										({ update }) => {
											deletingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={category.id} />
									{#if category.expenseCount > 0}
										<select
											class="field__input"
											name="replacementId"
											aria-label="What happens to this category's expenses"
										>
											<option value="" selected>Remove from expenses</option>
											{#each otherCategories(category.id) as other}
												<option value={other.id}>Reassign to {other.name}</option>
											{/each}
										</select>
									{/if}
									<button class="link-action link-action--danger" type="submit">Confirm</button>
									<button
										class="link-action"
										type="button"
										onclick={() => (deletingId = null)}
									>
										Cancel
									</button>
								</form>
							{:else}
								<div class="row-actions">
									<button
										class="link-action"
										type="button"
										onclick={() => {
											editingId = category.id;
											deletingId = null;
										}}
									>
										Edit
									</button>
									<button
										class="link-action link-action--danger"
										type="button"
										onclick={() => (deletingId = category.id)}
									>
										Delete
									</button>
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style lang="scss">
	@use 'variables' as *;

	.category-form {
		display: flex;
		align-items: flex-end;
		gap: $space-md;

		.field {
			flex: 1;
			margin-bottom: 0;
		}

		.field--color {
			flex: 0 0 auto;
		}
	}

	.delete-form,
	.rename-form,
	.row-actions {
		display: flex;
		align-items: center;
		gap: $space-sm;
	}

	.color-input {
		width: 2.75rem;
		height: 2.6rem;
		padding: 2px;
		border: 1px solid $color-border;
		border-radius: $radius;
		background: $color-surface-raised;
		cursor: pointer;
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
