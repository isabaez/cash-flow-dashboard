<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Whether the "add category" modal is open
	let showAddModal = $state(false);
	// Category id currently pending deletion (shows the replacement picker)
	let deletingId = $state<number | null>(null);
	// Category id currently being renamed
	let editingId = $state<number | null>(null);

	function otherCategories(id: number) {
		return data.categories.filter((c) => c.id !== id);
	}
</script>

<div class="page-header">
	<h1>Categories</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add category</button>
</div>

{#if form?.error}
	<p class="form-error">{form.error}</p>
{/if}

<Modal bind:open={showAddModal} title="New category">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
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
		<button class="button" type="submit">Add</button>
	</form>
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
									action="?/rename"
									use:enhance={() =>
										({ update }) => {
											editingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={category.id} />
									<input
										class="field__input"
										name="name"
										required
										value={category.name}
										aria-label="Category name"
									/>
									<button class="button" type="submit">Save</button>
									<button
										class="button button--ghost"
										type="button"
										onclick={() => (editingId = null)}
									>
										Cancel
									</button>
								</form>
							{:else}
								{category.name}
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
										<select class="field__input" name="replacementId" required>
											<option value="" disabled selected>Reassign expenses to…</option>
											{#each otherCategories(category.id) as other}
												<option value={other.id}>{other.name}</option>
											{/each}
										</select>
									{/if}
									<button class="button button--danger" type="submit">Confirm</button>
									<button
										class="button button--ghost"
										type="button"
										onclick={() => (deletingId = null)}
									>
										Cancel
									</button>
								</form>
							{:else}
								<div class="row-actions">
									<button
										class="button button--ghost"
										type="button"
										onclick={() => {
											editingId = category.id;
											deletingId = null;
										}}
									>
										Edit
									</button>
									<button
										class="button button--ghost"
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
	}

	.delete-form,
	.rename-form,
	.row-actions {
		display: flex;
		align-items: center;
		gap: $space-sm;
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
