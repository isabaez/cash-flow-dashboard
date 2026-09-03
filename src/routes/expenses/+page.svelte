<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
	import CategoryTag from '$lib/components/CategoryTag.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { formatCents } from '$lib/money';
	import { formatDate } from '$lib/date';
	import { parseCsv, toExpenseRows, type CsvExpenseRow } from '$lib/csv';
	import { applyCategoryFilters } from '$lib/filters';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// --- CSV import ----------------------------------------------------------
	const IMPORT_BATCH_SIZE = 50;
	type RowResult = { line: number; ok: boolean; error?: string };

	let showImportModal = $state(false);
	let importRows = $state<CsvExpenseRow[]>([]);
	let importFileName = $state('');
	let importParseError = $state<string | null>(null);
	let importing = $state(false);
	let importProcessed = $state(0);
	let importFailures = $state<RowResult[]>([]);
	let importDone = $state(false);

	const importProgress = $derived(
		importRows.length > 0 ? (importProcessed / importRows.length) * 100 : 0
	);
	const importedCount = $derived(importProcessed - importFailures.length);

	function resetImport() {
		importRows = [];
		importFileName = '';
		importParseError = null;
		importing = false;
		importProcessed = 0;
		importFailures = [];
		importDone = false;
	}

	function openImport() {
		resetImport();
		showImportModal = true;
	}

	async function onImportFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		importRows = [];
		importParseError = null;
		importFailures = [];
		importDone = false;
		importProcessed = 0;
		if (!file) {
			importFileName = '';
			return;
		}
		importFileName = file.name;
		try {
			const text = await file.text();
			const rows = toExpenseRows(parseCsv(text));
			if (rows.length === 0) {
				importParseError = 'No data rows found in this file.';
				return;
			}
			importRows = rows;
		} catch {
			importParseError = 'Could not read this file.';
		}
	}

	async function runImport() {
		if (importing || importRows.length === 0) return;
		importing = true;
		importDone = false;
		importProcessed = 0;
		importFailures = [];

		try {
			for (let i = 0; i < importRows.length; i += IMPORT_BATCH_SIZE) {
				const batch = importRows.slice(i, i + IMPORT_BATCH_SIZE);
				const res = await fetch('/expenses/import', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ rows: batch })
				});
				if (!res.ok) {
					const detail = await res.json().catch(() => ({}));
					importParseError = detail?.error ?? `Import failed (HTTP ${res.status}).`;
					break;
				}
				const { results } = (await res.json()) as { results: RowResult[] };
				importFailures = [...importFailures, ...results.filter((r) => !r.ok)];
				importProcessed += batch.length;
			}
			importDone = true;
			// The table + category list come from the page load; refresh them.
			await invalidateAll();
		} finally {
			importing = false;
		}
	}

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
	<div class="page-header__actions">
		<button class="button button--ghost" type="button" onclick={openImport}>Import CSV</button>
		<button class="button" type="button" onclick={() => (showAddModal = true)}>Add expense</button>
	</div>
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

<Modal bind:open={showImportModal} title="Import expenses from CSV">
	<p class="import-hint">
		Upload a CSV with columns <strong>Date, Title, Amount, Categories</strong>. Dates use
		<code>MM/DD/YYYY</code>. Categories can be blank, one name, or a comma-separated list — wrap a
		multi-category cell in quotes, e.g. <code>"Groceries, Dining"</code>. Unknown categories are
		created automatically. Invalid rows are skipped and listed below.
	</p>

	<div class="import-file">
		<input
			class="field__input"
			type="file"
			accept=".csv,text/csv"
			disabled={importing}
			onchange={onImportFileChange}
		/>
	</div>

	{#if importParseError}
		<p class="form-error">{importParseError}</p>
	{/if}

	{#if importRows.length > 0}
		<p class="import-status">
			{importFileName} — {importRows.length}
			{importRows.length === 1 ? 'row' : 'rows'} ready to import.
		</p>
	{/if}

	{#if importing || importDone}
		<div class="import-progress">
			<ProgressBar value={importProgress} label="CSV import progress" />
			<span class="import-progress__count">{importProcessed} / {importRows.length}</span>
		</div>
	{/if}

	{#if importDone}
		<p class="import-summary">
			Imported {importedCount}
			{importedCount === 1 ? 'expense' : 'expenses'}{importFailures.length > 0
				? `, skipped ${importFailures.length}`
				: ''}.
		</p>
		{#if importFailures.length > 0}
			<div class="import-errors">
				<p class="import-errors__title">Skipped rows:</p>
				<ul class="import-errors__list">
					{#each importFailures as failure (failure.line)}
						<li>Line {failure.line}: {failure.error}</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}

	<div class="import-actions">
		{#if importDone}
			<button class="button" type="button" onclick={() => (showImportModal = false)}>Done</button>
		{:else}
			<button
				class="button"
				type="button"
				disabled={importing || importRows.length === 0}
				onclick={runImport}
			>
				{importing ? 'Importing…' : 'Import'}
			</button>
		{/if}
	</div>
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
					value={duplicating.date}
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
		<div class="bulk-toolbar__group">
			<div class="bulk-toolbar__picker">
				<MultiSelect
					options={data.categories}
					name="categoryId"
					label="Categories"
					placeholder="Select categories"
				/>
			</div>
			<button class="button" type="submit">Apply tags</button>
			<button class="button button--ghost" type="submit" formaction="?/removeCategories">
				Remove tags
			</button>
		</div>
		<div class="bulk-toolbar__group">
			<select class="field__input bulk-toolbar__fund" name="fundId" aria-label="Fund">
				<option value="">Fund…</option>
				{#each data.funds as fund}
					<option value={fund.id}>{fund.name}</option>
				{/each}
			</select>
			<button class="button" type="submit" formaction="?/setFund">Set fund</button>
			<button class="button button--ghost" type="submit" formaction="?/removeFund">
				Remove fund
			</button>
		</div>
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
									<button class="link-action" type="button" onclick={() => (deletingId = null)}>
										Cancel
									</button>
                  <button class="link-action link-action--danger" type="submit">Confirm</button>
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
		// Stay visible while scrolling a long list; sits flush below the sticky top
		// nav (z-index 20) without overlapping it.
		position: sticky;
		top: $header-height;
		z-index: 10;
		box-shadow: $shadow;

		&__count {
			font-size: $text-sm;
			font-weight: 500;
			color: $color-text-muted;
		}

		&__group {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: $space-sm;
		}

		&__picker {
			position: relative;
			min-width: 220px;
		}

		&__fund {
			width: auto;
			min-width: 160px;
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

	.page-header__actions {
		display: flex;
		gap: $space-sm;
	}

	.import-hint {
		margin: 0 0 $space-md;
		font-size: $text-sm;
		color: $color-text-muted;

		code {
			background: $color-surface-raised;
			padding: 0 $space-xs;
			border-radius: 4px;
		}
	}

	.import-file {
		margin-bottom: $space-md;
	}

	.import-status {
		margin: 0 0 $space-md;
		font-size: $text-sm;
		color: $color-text-muted;
	}

	.import-progress {
		display: flex;
		align-items: center;
		gap: $space-sm;
		margin-bottom: $space-md;

		&__count {
			font-size: $text-sm;
			color: $color-text-muted;
			white-space: nowrap;
			font-variant-numeric: tabular-nums;
		}
	}

	.import-summary {
		margin: 0 0 $space-sm;
		font-weight: 500;
	}

	.import-errors {
		margin-bottom: $space-md;
		max-height: 12rem;
		overflow-y: auto;

		&__title {
			margin: 0 0 $space-xs;
			font-size: $text-sm;
			color: $color-danger;
		}

		&__list {
			margin: 0;
			padding-left: $space-lg;
			font-size: $text-sm;
			color: $color-text-muted;

			li {
				margin-bottom: $space-xs;
			}
		}
	}

	.import-actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
