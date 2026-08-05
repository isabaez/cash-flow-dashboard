<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import { formatCents } from '$lib/money';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Expense = (typeof data.expenses)[number];

	// Whether the "add expense" modal is open.
	let showAddModal = $state(false);
	// Which expense's income-split panel is expanded.
	let expandedId = $state<number | null>(null);
	// Which expense is being edited inline.
	let editingId = $state<number | null>(null);
	// Which expense is pending delete confirmation.
	let deletingId = $state<number | null>(null);

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	/**
	 * Split an expense across its income streams in proportion to each stream's
	 * income amount. The rounding remainder goes to the last stream so the shares
	 * sum exactly to the expense amount. Falls back to an equal split if the
	 * selected streams have no income.
	 */
	function streamSplit(expense: Expense): { title: string; shareCents: number }[] {
		const links = expense.incomeStreamLinks;
		const total = links.reduce((sum, l) => sum + l.incomeStream.amountCents, 0);
		let allocated = 0;
		return links.map((l, i) => {
			let shareCents: number;
			if (i === links.length - 1) {
				shareCents = expense.amountCents - allocated;
			} else if (total > 0) {
				shareCents = Math.round((expense.amountCents * l.incomeStream.amountCents) / total);
			} else {
				shareCents = Math.round(expense.amountCents / links.length);
			}
			allocated += shareCents;
			return { title: l.incomeStream.title, shareCents };
		});
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}
</script>

<div class="page-header">
	<h1>Expenses</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add expense</button>
</div>

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

	<fieldset class="picker">
		<legend class="field__label">Category (optional)</legend>
		<div class="picker__options">
			<label class="picker__option">
				<input type="radio" name="categoryId" value="" checked={!expense?.categoryId} />
				None
			</label>
			{#each data.categories as category}
				<label class="picker__option">
					<input
						type="radio"
						name="categoryId"
						value={category.id}
						checked={expense?.categoryId === category.id}
					/>
					{category.name}
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset class="picker">
		<legend class="field__label">Apply to income streams</legend>
		{#if data.streams.length === 0}
			<p class="picker__empty">No income streams yet — add them on the Income page.</p>
		{:else}
			<div class="picker__options">
				{#each data.streams as stream}
					<label class="picker__option">
						<input
							type="checkbox"
							name="incomeStreamId"
							value={stream.id}
							checked={expense
								? expense.incomeStreamLinks.some((l) => l.incomeStreamId === stream.id)
								: true}
						/>
						{stream.title}
					</label>
				{/each}
			</div>
		{/if}
	</fieldset>

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
</Modal>

<div class="card">
	{#if data.expenses.length === 0}
		<p class="empty-state">No expenses yet.</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th class="table__cell--caret"></th>
					<th>Date</th>
					<th>Title</th>
					<th>Category</th>
					<th class="table__cell--number">Amount</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenses as expense (expense.id)}
					{#if editingId === expense.id}
						<tr>
							<td colspan="6">
								<form
									class="expense-form"
									method="POST"
									action="?/update"
									use:enhance={() =>
										({ update }) => {
											editingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={expense.id} />
									{@render expenseFields(expense, `edit-${expense.id}`)}
									<div class="inline-form">
										<button class="button" type="submit">Save</button>
										<button
											class="button button--ghost"
											type="button"
											onclick={() => (editingId = null)}
										>
											Cancel
										</button>
									</div>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td class="table__cell--caret">
								<button
									class="caret"
									class:caret--open={expandedId === expense.id}
									type="button"
									aria-expanded={expandedId === expense.id}
									aria-label="Toggle income split for {expense.title}"
									onclick={() => toggleExpanded(expense.id)}
								>
									▸
								</button>
							</td>
							<td>{expense.date}</td>
							<td>{expense.title}</td>
							<td>{expense.category?.name ?? '—'}</td>
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
									<div class="inline-form">
										<button
											class="button button--ghost"
											type="button"
											onclick={() => {
												editingId = expense.id;
												deletingId = null;
											}}
										>
											Edit
										</button>
										<button
											class="button button--ghost"
											type="button"
											onclick={() => (deletingId = expense.id)}
										>
											Delete
										</button>
									</div>
								{/if}
							</td>
						</tr>

						{#if expandedId === expense.id}
							<tr class="detail-row">
								<td colspan="6">
									<div class="split">
										<h3 class="split__title">Income split</h3>
										{#if expense.incomeStreamLinks.length === 0}
											<p class="split__empty">Not applied to any income streams.</p>
										{:else}
											<table class="table split__list">
												<tbody>
													{#each streamSplit(expense) as part}
														<tr>
															<td>{part.title}</td>
															<td class="table__cell--number">
																{formatCents(part.shareCents)}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{/if}
									</div>
								</td>
							</tr>
						{/if}
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

	.picker {
		border: 1px solid $color-border;
		border-radius: $radius;
		padding: $space-sm $space-md $space-md;
		margin: 0 0 $space-md;

		&__options {
			display: flex;
			flex-wrap: wrap;
			gap: $space-sm $space-lg;
			margin-top: $space-sm;
		}

		&__option {
			display: flex;
			align-items: center;
			gap: $space-xs;
			font-size: $text-sm;
			cursor: pointer;
		}

		&__empty {
			color: $color-text-muted;
			font-size: $text-sm;
			margin: $space-xs 0 0;
		}
	}

	textarea.field__input {
		resize: vertical;
		min-height: 4rem;
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

	.split {
		&__title {
			font-size: $text-base;
			margin-bottom: $space-sm;
		}

		&__empty {
			color: $color-text-muted;
			font-size: $text-sm;
			margin: 0;
		}

		&__list {
			max-width: 420px;
			background: $color-surface;
			border-radius: $radius;
		}
	}

	.inline-form {
		display: flex;
		align-items: center;
		gap: $space-sm;
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
