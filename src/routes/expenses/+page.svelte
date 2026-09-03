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
	import { scrollable } from '$lib/actions';
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

<svelte:head>
	<title>Expenses · Cash Flow</title>
</svelte:head>

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
	<p class="form-error" role="alert">{form.error}</p>
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
		<p class="form-error" role="alert">{form.error}</p>
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
		<p class="form-error" role="alert">{importParseError}</p>
	{/if}

	{#if importRows.length > 0}
		<p class="import-status">
			{importFileName} — {importRows.length}
			{importRows.length === 1 ? 'row' : 'rows'} ready to import.
		</p>
	{/if}

	{#if importing || importDone}
		<div class="import-progress" aria-busy={importing}>
			<ProgressBar value={importProgress} label="CSV import progress" />
			<span class="import-progress__count">{importProcessed} / {importRows.length}</span>
		</div>
	{/if}

	<!-- Progress and outcome are announced; the bar itself is silent to AT. -->
	<p class="visually-hidden" role="status">
		{#if importing}
			Importing row {importProcessed} of {importRows.length}.
		{:else if importDone}
			Import finished. {importedCount} imported, {importFailures.length} skipped.
		{/if}
	</p>

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
		<p class="form-error" role="alert">{form.error}</p>
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
		<p class="form-error" role="alert">{form.error}</p>
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
		<span class="bulk-toolbar__count" role="status">
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
		<div class="empty-state">
			{#if data.filters.month || data.filters.year || data.filters.categoryIds.length > 0}
				<p class="empty-state__title">No expenses match the current filters.</p>
				<p class="empty-state__hint">Clear a filter above to widen the search.</p>
			{:else}
				<p class="empty-state__title">No expenses yet.</p>
				<p class="empty-state__hint">Add one by hand, or import a CSV from your bank.</p>
				<div class="empty-state__actions">
					<button class="button" type="button" onclick={() => (showAddModal = true)}>
						Add expense
					</button>
					<button class="button button--ghost" type="button" onclick={openImport}>
						Import CSV
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="table-scroll" use:scrollable={'Expenses table'}>
		<table class="table">
			<caption class="visually-hidden">
				{data.expenses.length} expenses, newest first. Each row can be selected for bulk tagging,
				and rows with notes or a linked fund withdrawal can be expanded for detail.
			</caption>
			<thead>
				<tr class="table__head">
					<th scope="col" class="table__cell--select">
						<input
							type="checkbox"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={toggleAll}
							aria-label="Select all expenses"
						/>
					</th>
					<th scope="col" class="table__cell--caret">
						<span class="visually-hidden">Expand row</span>
					</th>
					<th scope="col">Date</th>
					<th scope="col">Title</th>
					<th scope="col">Categories</th>
					<th scope="col" class="table__cell--number">Amount</th>
					<th scope="col"><span class="visually-hidden">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenses as expense (expense.id)}
					<tr aria-selected={selectedIds.includes(expense.id)}>
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
									<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
										<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</button>
							{/if}
						</td>
						<td class="table__cell--date">{formatDate(expense.date)}</td>
						<th scope="row" class="table__cell--title">{expense.title}</th>
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
						<td class="table__cell--number table__cell--emphasis">
							{formatCents(expense.amountCents)}
						</td>
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
		</div>
	{/if}
</div>

<style lang="scss">
	@use 'breakpoints' as *;

	.expense-form__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-4);

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
		gap: var(--space-4);
	}

	.category-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.bulk-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		// Stays put while a long list scrolls. On mobile it clears the sticky top bar;
		// on desktop there is no top bar, so it sits at the very top of the viewport.
		position: sticky;
		top: var(--header-h);
		z-index: 10;
		box-shadow: var(--shadow-2);
		animation: bulk-in var(--dur-base) var(--ease-out);

		@media (min-width: $breakpoint-lg) {
			top: var(--space-3);
		}

		&__count {
			font-size: var(--text-sm);
			font-weight: 600;
			color: var(--text-primary);
		}

		&__group {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-2);
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

	@keyframes bulk-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}

	.table__cell--select {
		width: 2.25rem;
		padding-right: 0;

		input {
			cursor: pointer;
			// Native checkboxes are ~13px; the WCAG 2.2 target floor is 24.
			inline-size: 16px;
			block-size: 16px;
			accent-color: var(--accent);
		}
	}

	.table__cell--caret {
		width: 2.25rem;
		padding-right: 0;
	}

	.table__cell--title {
		font-weight: 500;
	}

	.detail {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-4) var(--space-5);
		margin: 0;
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);

		&__item--wide {
			grid-column: 1 / -1;
		}

		&__label {
			font-size: var(--text-sm);
			color: var(--text-secondary);
			margin-bottom: var(--space-1);
		}

		&__value {
			margin: 0;
			font-size: var(--text-sm);
		}

		&__muted {
			color: var(--text-secondary);
		}
	}

	.applied-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);

		&__label {
			font-size: var(--text-sm);
			font-weight: 500;
			color: var(--text-secondary);
		}
	}

	.duplicate-hint {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-sm);
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

	.page-header__actions {
		display: flex;
		gap: var(--space-2);
	}

	.import-hint {
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-secondary);

		code {
			background: var(--surface-2);
			padding: 0 var(--space-1);
			border-radius: 4px;
		}
	}

	.import-file {
		margin-bottom: var(--space-4);
	}

	.import-status {
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.import-progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);

		&__count {
			font-size: var(--text-sm);
			color: var(--text-secondary);
			white-space: nowrap;
			font-variant-numeric: tabular-nums;
		}
	}

	.import-summary {
		margin: 0 0 var(--space-2);
		font-weight: 500;
	}

	.import-errors {
		margin-bottom: var(--space-4);
		max-height: 12rem;
		overflow-y: auto;

		&__title {
			margin: 0 0 var(--space-1);
			font-size: var(--text-sm);
			color: var(--neg);
		}

		&__list {
			margin: 0;
			padding-left: var(--space-5);
			font-size: var(--text-sm);
			color: var(--text-secondary);

			li {
				margin-bottom: var(--space-1);
			}
		}
	}

	.import-actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
