<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
	import CategoryTag from '$lib/components/CategoryTag.svelte';
	import { formatCents } from '$lib/money';
	import { formatDate } from '$lib/date';
	import { applyCategoryFilters } from '$lib/filters';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Expense = (typeof data.expenses)[number];
	type Category = (typeof data.categories)[number];

	// Category objects for the currently-applied AND filter, in applied order.
	const appliedCategories = $derived(
		data.filters.categoryIds
			.map((id) => data.categories.find((c) => c.id === id))
			.filter((c): c is Category => c != null)
	);

	function addCategoryFilter(id: number) {
		if (!data.filters.categoryIds.includes(id)) {
			applyCategoryFilters(page.url, [...data.filters.categoryIds, id]);
		}
	}

	function removeCategoryFilter(id: number) {
		applyCategoryFilters(
			page.url,
			data.filters.categoryIds.filter((c) => c !== id)
		);
	}

	// Whether the "add expense" modal is open.
	let showAddModal = $state(false);
	// Expense being edited in the edit modal.
	let editing = $state<Expense | null>(null);
	let showEditModal = $state(false);
	// Expense being duplicated in the duplicate modal.
	let duplicating = $state<Expense | null>(null);
	let showDuplicateModal = $state(false);
	// Which expense is pending delete confirmation.
	let deletingId = $state<number | null>(null);
	// Which expense's detail panel is expanded.
	let expandedId = $state<number | null>(null);

	// Ids of expenses currently checked for the bulk-tag action.
	let selectedIds = $state<number[]>([]);

	// Drop ids that no longer exist after a filter change or data reload.
	$effect(() => {
		const present = new Set(data.expenses.map((e) => e.id));
		const kept = selectedIds.filter((id) => present.has(id));
		if (kept.length !== selectedIds.length) selectedIds = kept;
	});

	const allSelected = $derived(
		data.expenses.length > 0 && selectedIds.length === data.expenses.length
	);
	const someSelected = $derived(selectedIds.length > 0 && !allSelected);

	function toggleRow(id: number) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((s) => s !== id)
			: [...selectedIds, id];
	}

	function toggleAll() {
		selectedIds = allSelected ? [] : data.expenses.map((e) => e.id);
	}

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	// A row is only expandable when it has details worth revealing.
	function hasDetails(expense: Expense): boolean {
		return expense.fundWithdrawals.length > 0 || !!expense.notes;
	}

	function openEdit(expense: Expense) {
		editing = expense;
		deletingId = null;
		showEditModal = true;
	}

	function openDuplicate(expense: Expense) {
		duplicating = expense;
		deletingId = null;
		showDuplicateModal = true;
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}
</script>

<div class="page-header">
	<h1>Expenses</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add expense</button>
</div>

<FilterBar
	months={data.availableMonths}
	years={data.availableYears}
	month={data.filters.month}
	year={data.filters.year}
	categories={data.categories}
	categoryIds={data.filters.categoryIds}
/>

{#if appliedCategories.length > 0}
	<div class="applied-filters">
		<span class="applied-filters__label">Applied Filters:</span>
		{#each appliedCategories as category (category.id)}
			<CategoryTag
				name={category.name}
				color={category.color}
				onremove={() => removeCategoryFilter(category.id)}
			/>
		{/each}
	</div>
{/if}

{#if form?.error}
	<p class="form-error">{form.error}</p>
{/if}

{#snippet expenseFields(expense: Expense | null, idPrefix: string)}
	<div class="expense-form__grid">
		<div class="field">
			<label class="field__label" for="{idPrefix}-title">Title</label>
			<input
				class="field__input"
				id="{idPrefix}-title"
				name="title"
				required
				placeholder="e.g. Electric bill"
				value={expense?.title ?? ''}
			/>
		</div>
		<div class="field">
			<label class="field__label" for="{idPrefix}-amount">Amount</label>
			<input
				class="field__input"
				id="{idPrefix}-amount"
				name="amount"
				required
				placeholder="e.g. 120.00"
				value={expense ? dollars(expense.amountCents) : ''}
			/>
		</div>
		<div class="field">
			<label class="field__label" for="{idPrefix}-date">Date</label>
			<input
				class="field__input"
				id="{idPrefix}-date"
				name="date"
				type="date"
				required
				value={expense?.date ?? data.today}
			/>
		</div>
	</div>

	<div class="field">
		<span class="field__label" id="{idPrefix}-categories-label">Categories</span>
		<MultiSelect
			options={data.categories}
			name="categoryId"
			selected={expense ? expense.categoryLinks.map((l) => l.categoryId) : []}
			label="Categories"
			placeholder="No categories"
		/>
	</div>

	<div class="field">
		<label class="field__label" for="{idPrefix}-fund">Pay from fund (optional)</label>
		<select class="field__input" id="{idPrefix}-fund" name="fundId">
			<option value="">None</option>
			{#each data.funds as fund}
				<option value={fund.id} selected={expense?.fundWithdrawals[0]?.fundId === fund.id}>
					{fund.name}
				</option>
			{/each}
		</select>
		<span class="field__hint">Records a matching withdrawal in the fund's ledger.</span>
	</div>

	<div class="field">
		<label class="field__label" for="{idPrefix}-notes">Notes (optional)</label>
		<textarea
			class="field__input"
			id="{idPrefix}-notes"
			name="notes"
			rows="3"
			placeholder="Optional">{expense?.notes ?? ''}</textarea>
	</div>
{/snippet}

<Modal bind:open={showAddModal} title="New expense">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	{#key showAddModal}
		<form
			class="expense-form"
			method="POST"
			action="?/create"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showAddModal = false;
				}}
		>
			{@render expenseFields(null, 'new')}
			<button class="button" type="submit">Add expense</button>
		</form>
	{/key}
</Modal>

<Modal bind:open={showEditModal} title="Edit expense">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	<!-- Key on the open flag too: the post-save form reset empties the DOM inputs,
	     so reopening the same expense must remount the form with fresh values. -->
	{#key `${showEditModal}-${editing?.id}`}
		{#if editing}
			<form
				class="expense-form"
				method="POST"
				action="?/update"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') showEditModal = false;
					}}
			>
				<input type="hidden" name="id" value={editing.id} />
				{@render expenseFields(editing, `edit-${editing.id}`)}
				<button class="button" type="submit">Save changes</button>
			</form>
		{/if}
	{/key}
</Modal>

<Modal bind:open={showDuplicateModal} title="Duplicate expense">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	{#key showDuplicateModal}
	{#if duplicating}
		<p class="duplicate-hint">
			Copies “{duplicating.title}” ({formatCents(duplicating.amountCents)})
			{#if duplicating.categoryLinks.length > 0}
				with {duplicating.categoryLinks.length}
				{duplicating.categoryLinks.length === 1 ? 'category' : 'categories'}
			{/if}
			— then edit the title, amount, and date below.
		</p>
		<form
			method="POST"
			action="?/duplicate"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showDuplicateModal = false;
				}}
		>
			<input type="hidden" name="id" value={duplicating.id} />
			<div class="field">
				<label class="field__label" for="duplicate-title">Title</label>
				<input
					class="field__input"
					id="duplicate-title"
					name="title"
					required
					value={duplicating.title}
				/>
			</div>
			<div class="field">
				<label class="field__label" for="duplicate-amount">Amount</label>
				<input
					class="field__input"
					id="duplicate-amount"
					name="amount"
					required
					value={dollars(duplicating.amountCents)}
				/>
			</div>
			<div class="field">
				<label class="field__label" for="duplicate-date">New date</label>
				<input
					class="field__input"
					id="duplicate-date"
					name="date"
					type="date"
					required
					value={data.today}
				/>
			</div>
			<button class="button" type="submit">Duplicate</button>
		</form>
	{/if}
	{/key}
</Modal>

{#if selectedIds.length > 0}
	<form
		class="bulk-toolbar"
		method="POST"
		action="?/applyCategories"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') selectedIds = [];
			}}
	>
		{#each selectedIds as id (id)}
			<input type="hidden" name="expenseId" value={id} />
		{/each}
		<span class="bulk-toolbar__count">
			{selectedIds.length} selected
		</span>
		<div class="bulk-toolbar__picker">
			<MultiSelect
				options={data.categories}
				name="categoryId"
				label="Categories to apply"
				placeholder="Select categories"
			/>
		</div>
		<button class="button" type="submit">Apply tags</button>
	</form>
{/if}

<div class="card">
	{#if data.expenses.length === 0}
		<p class="empty-state">
			{#if data.filters.month || data.filters.year || data.filters.categoryIds.length > 0}
				No expenses match the current filters.
			{:else}
				No expenses yet.
			{/if}
		</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th class="table__cell--select">
						<input
							type="checkbox"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={toggleAll}
							aria-label="Select all expenses"
						/>
					</th>
					<th class="table__cell--caret"></th>
					<th>Date</th>
					<th>Title</th>
					<th>Categories</th>
					<th class="table__cell--number">Amount</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenses as expense (expense.id)}
					<tr>
						<td class="table__cell--select">
							<input
								type="checkbox"
								checked={selectedIds.includes(expense.id)}
								onchange={() => toggleRow(expense.id)}
								aria-label="Select {expense.title}"
							/>
						</td>
						<td class="table__cell--caret">
							{#if hasDetails(expense)}
								<button
									class="caret"
									class:caret--open={expandedId === expense.id}
									type="button"
									aria-expanded={expandedId === expense.id}
									aria-label="Toggle details for {expense.title}"
									onclick={() => toggleExpanded(expense.id)}
								>
									▸
								</button>
							{/if}
						</td>
						<td>{formatDate(expense.date)}</td>
						<td>{expense.title}</td>
						<td>
							{#if expense.categoryLinks.length > 0}
								<div class="category-tags">
									{#each expense.categoryLinks as link (link.category.id)}
										<CategoryTag
											name={link.category.name}
											color={link.category.color}
											onclick={() => addCategoryFilter(link.category.id)}
										/>
									{/each}
								</div>
							{:else}
								—
							{/if}
						</td>
						<td class="table__cell--number">{formatCents(expense.amountCents)}</td>
						<td>
							{#if deletingId === expense.id}
								<form
									class="inline-form"
									method="POST"
									action="?/delete"
									use:enhance={() =>
										({ update }) => {
											deletingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={expense.id} />
									<button class="link-action link-action--danger" type="submit">Confirm</button>
									<button class="link-action" type="button" onclick={() => (deletingId = null)}>
										Cancel
									</button>
								</form>
							{:else}
								<div class="inline-form">
									<button class="link-action" type="button" onclick={() => openEdit(expense)}>
										Edit
									</button>
									<button class="link-action" type="button" onclick={() => openDuplicate(expense)}>
										Duplicate
									</button>
									<button
										class="link-action link-action--danger"
										type="button"
										onclick={() => (deletingId = expense.id)}
									>
										Delete
									</button>
								</div>
							{/if}
						</td>
					</tr>

					{#if expandedId === expense.id && hasDetails(expense)}
						<tr class="detail-row">
							<td colspan="7">
								<dl class="detail">
									{#if expense.fundWithdrawals[0]}
										<div class="detail__item">
											<dt class="detail__label">Paid from</dt>
											<dd class="detail__value">
												{expense.fundWithdrawals[0].fund.name}
												<span class="detail__muted">
													(withdrawal of {formatCents(expense.fundWithdrawals[0].amountCents)})
												</span>
											</dd>
										</div>
									{/if}
									{#if expense.notes}
										<div class="detail__item detail__item--wide">
											<dt class="detail__label">Notes</dt>
											<dd class="detail__value">{expense.notes}</dd>
										</div>
									{/if}
								</dl>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style lang="scss">
	@use 'variables' as *;

	.expense-form__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: $space-md;
		margin-bottom: $space-md;

		.field {
			margin-bottom: 0;
		}
	}

	textarea.field__input {
		resize: vertical;
		min-height: 4rem;
	}

	.inline-form {
		display: flex;
		align-items: center;
		gap: $space-md;
	}

	.category-tags {
		display: flex;
		flex-wrap: wrap;
		gap: $space-xs;
	}

	.bulk-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: $space-md;
		margin-bottom: $space-md;
		padding: $space-md;
		background: $color-surface-raised;
		border: 1px solid $color-border;
		border-radius: $radius;

		&__count {
			font-size: $text-sm;
			font-weight: 500;
			color: $color-text-muted;
		}

		&__picker {
			position: relative;
			min-width: 220px;
		}
	}

	.table__cell--select {
		width: 2rem;
		padding-right: 0;

		input {
			cursor: pointer;
		}
	}

	.table__cell--caret {
		width: 2rem;
		padding-right: 0;
	}

	.caret {
		background: none;
		border: none;
		cursor: pointer;
		font-size: $text-base;
		color: $color-text-muted;
		padding: $space-xs;
		line-height: 1;
		transition: transform 0.15s ease;

		&--open {
			transform: rotate(90deg);
		}
	}

	.detail-row > td {
		background: $color-bg;
		padding: $space-md $space-lg;
	}

	.detail {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: $space-md $space-lg;
		margin: 0;

		&__item--wide {
			grid-column: 1 / -1;
		}

		&__label {
			font-size: $text-sm;
			color: $color-text-muted;
			margin-bottom: $space-xs;
		}

		&__value {
			margin: 0;
			font-size: $text-sm;
		}

		&__muted {
			color: $color-text-muted;
		}
	}

	.applied-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: $space-sm;
		margin-bottom: $space-md;

		&__label {
			font-size: $text-sm;
			font-weight: 500;
			color: $color-text-muted;
		}
	}

	.duplicate-hint {
		margin: 0 0 $space-md;
		color: $color-text-muted;
		font-size: $text-sm;
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
