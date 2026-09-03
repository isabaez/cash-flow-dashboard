<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import { formatCents } from '$lib/money';
	import { formatDate } from '$lib/date';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Fund = (typeof data.funds)[number];

	// Whether the "add fund" modal is open.
	let showAddModal = $state(false);
	// Fund being edited in the edit modal.
	let editing = $state<Fund | null>(null);
	let showEditModal = $state(false);
	// Which fund is pending delete confirmation.
	let deletingId = $state<number | null>(null);
	// Which fund's ledger is expanded.
	let expandedId = $state<number | null>(null);
	// Which ledger entry is being edited inline, as "<kind>:<id>" — deposit and
	// withdrawal ids are separate sequences, so the kind is part of the key.
	let editingEntryKey = $state<string | null>(null);

	function entryKey(entry: Fund['ledger'][number]): string {
		return `${entry.kind}:${entry.entryId}`;
	}

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	function openEdit(fund: Fund) {
		editing = fund;
		deletingId = null;
		showEditModal = true;
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	// --- Column sorting (client-side; the full fund list is already loaded) ---
	type SortKey =
		| 'name'
		| 'isSavings'
		| 'initialCents'
		| 'contributedCents'
		| 'depositedCents'
		| 'withdrawnCents'
		| 'balanceCents';

	let sortKey = $state<SortKey>('balanceCents');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function setSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			// Text sorts A→Z first; amounts show the largest first.
			sortDir = key === 'name' || key === 'isSavings' ? 'asc' : 'desc';
		}
	}

	const sortedFunds = $derived(
		[...data.funds].sort((a, b) => {
			let cmp: number;
			if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
			else if (sortKey === 'isSavings') cmp = Number(b.isSavings) - Number(a.isSavings);
			else cmp = a[sortKey] - b[sortKey];
			if (sortDir === 'desc') cmp = -cmp;
			// Ties stay A→Z regardless of direction.
			return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
		})
	);

	function ariaSort(key: SortKey): 'ascending' | 'descending' | undefined {
		if (sortKey !== key) return undefined;
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}
</script>

<div class="page-header">
	<h1>Funds</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add fund</button>
</div>

{#if form?.error}
	<p class="form-error">{form.error}</p>
{/if}

{#snippet fundFields(fund: Fund | null, idPrefix: string)}
	<div class="field">
		<label class="field__label" for="{idPrefix}-name">Name</label>
		<input
			class="field__input"
			id="{idPrefix}-name"
			name="name"
			required
			placeholder="e.g. Emergency Fund"
			value={fund?.name ?? ''}
		/>
	</div>
	<div class="field">
		<label class="field__label" for="{idPrefix}-description">Description (optional)</label>
		<input
			class="field__input"
			id="{idPrefix}-description"
			name="description"
			placeholder="Optional"
			value={fund?.description ?? ''}
		/>
	</div>
	<div class="field">
		<label class="field__label" for="{idPrefix}-initial">Initial value</label>
		<input
			class="field__input"
			id="{idPrefix}-initial"
			name="initial"
			placeholder="e.g. 12,500.00"
			value={fund && fund.initialCents !== 0 ? dollars(fund.initialCents) : ''}
		/>
		<span class="field__hint">Starting balance from before you began tracking. Leave blank for $0.</span>
	</div>
	<label class="checkbox">
		<input type="checkbox" name="isSavings" checked={fund?.isSavings ?? true} />
		Savings / investment fund (contributions accumulate)
	</label>
{/snippet}

<Modal bind:open={showAddModal} title="New fund">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	{#key showAddModal}
		<form
			method="POST"
			action="?/createFund"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showAddModal = false;
				}}
		>
			{@render fundFields(null, 'new')}
			<button class="button" type="submit">Add fund</button>
		</form>
	{/key}
</Modal>

<Modal bind:open={showEditModal} title="Edit fund">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	<!-- Key on the open flag too: the post-save form reset empties the DOM inputs,
	     so reopening the same fund must remount the form with fresh values. -->
	{#key `${showEditModal}-${editing?.id}`}
		{#if editing}
			<form
				method="POST"
				action="?/updateFund"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') showEditModal = false;
					}}
			>
				<input type="hidden" name="id" value={editing.id} />
				{@render fundFields(editing, `edit-${editing.id}`)}
				<button class="button" type="submit">Save changes</button>
			</form>
		{/if}
	{/key}
</Modal>

<div class="card">
	{#if data.funds.length === 0}
		<p class="empty-state">No funds yet. Add funds, then funnel paychecks into them from the Income page.</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th class="table__cell--caret"></th>
					<th aria-sort={ariaSort('name')}>
						<button class="sort-button" type="button" onclick={() => setSort('name')}>
							Fund
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th aria-sort={ariaSort('isSavings')}>
						<button class="sort-button" type="button" onclick={() => setSort('isSavings')}>
							Savings?
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'isSavings' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th class="table__cell--number" aria-sort={ariaSort('initialCents')}>
						<button
							class="sort-button sort-button--number"
							type="button"
							onclick={() => setSort('initialCents')}
						>
							Initial
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'initialCents' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th class="table__cell--number" aria-sort={ariaSort('contributedCents')}>
						<button
							class="sort-button sort-button--number"
							type="button"
							onclick={() => setSort('contributedCents')}
						>
							Contributed
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'contributedCents' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th class="table__cell--number" aria-sort={ariaSort('depositedCents')}>
						<button
							class="sort-button sort-button--number"
							type="button"
							onclick={() => setSort('depositedCents')}
						>
							Deposited
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'depositedCents' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th class="table__cell--number" aria-sort={ariaSort('withdrawnCents')}>
						<button
							class="sort-button sort-button--number"
							type="button"
							onclick={() => setSort('withdrawnCents')}
						>
							Withdrawn
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'withdrawnCents' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th class="table__cell--number" aria-sort={ariaSort('balanceCents')}>
						<button
							class="sort-button sort-button--number"
							type="button"
							onclick={() => setSort('balanceCents')}
						>
							Balance
							<span class="sort-button__arrow" aria-hidden="true">
								{sortKey === 'balanceCents' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</button>
					</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each sortedFunds as fund (fund.id)}
					<tr>
						<td class="table__cell--caret">
							<button
								class="caret"
								class:caret--open={expandedId === fund.id}
								type="button"
								aria-expanded={expandedId === fund.id}
								aria-label="Toggle ledger for {fund.name}"
								onclick={() => toggleExpanded(fund.id)}
							>
								▸
							</button>
						</td>
						<td>
							{fund.name}
							{#if fund.description}
								<span class="fund-description">{fund.description}</span>
							{/if}
						</td>
						<td>{fund.isSavings ? 'Yes' : 'No'}</td>
						<td class="table__cell--number">{formatCents(fund.initialCents)}</td>
						<td class="table__cell--number">{formatCents(fund.contributedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.depositedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.withdrawnCents)}</td>
						<td class="table__cell--number">{formatCents(fund.balanceCents)}</td>
						<td>
							{#if deletingId === fund.id}
								<form
									class="inline-form"
									method="POST"
									action="?/deleteFund"
									use:enhance={() =>
										({ update }) => {
											deletingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={fund.id} />
									<button
										class="link-action"
										type="button"
										onclick={() => (deletingId = null)}
									>
										Cancel
									</button>
                  <button class="link-action link-action--danger" type="submit">Confirm</button>
								</form>
							{:else}
								<div class="inline-form">
									<button class="link-action" type="button" onclick={() => openEdit(fund)}>
										Edit
									</button>
									<button
										class="link-action link-action--danger"
										type="button"
										onclick={() => (deletingId = fund.id)}
									>
										Delete
									</button>
								</div>
							{/if}
						</td>
					</tr>

					{#if expandedId === fund.id}
						<tr class="detail-row">
							<td colspan="9">
								<div class="ledger">
									<h3 class="ledger__title">Ledger</h3>

									{#if fund.ledger.length === 0}
										<p class="ledger__empty">
											No movements yet. Contributions come from paycheck allocations on the Income
											page; deposits and withdrawals are recorded below.
										</p>
									{:else}
										<table class="table ledger__list">
											<tbody>
												{#each fund.ledger as entry (entry.kind + (entry.entryId ?? entry.date + entry.label + entry.amountCents))}
													{#if entry.entryId !== null && editingEntryKey === entryKey(entry)}
														<tr>
															<td colspan="5">
																<form
																	class="movement-form"
																	method="POST"
																	action={entry.kind === 'deposit'
																		? '?/updateDeposit'
																		: '?/updateWithdrawal'}
																	use:enhance={() =>
																		({ update }) => {
																			editingEntryKey = null;
																			update();
																		}}
																>
																	<input type="hidden" name="id" value={entry.entryId} />
																	<div class="field">
																		<label
																			class="field__label"
																			for="mv-edit-amount-{entryKey(entry)}"
																		>
																			Amount
																		</label>
																		<input
																			class="field__input"
																			id="mv-edit-amount-{entryKey(entry)}"
																			name="amount"
																			required
																			value={dollars(entry.amountCents)}
																		/>
																	</div>
																	<div class="field">
																		<label class="field__label" for="mv-edit-date-{entryKey(entry)}">
																			Date
																		</label>
																		<input
																			class="field__input"
																			id="mv-edit-date-{entryKey(entry)}"
																			name="date"
																			type="date"
																			required
																			value={entry.date}
																		/>
																	</div>
																	<div class="field">
																		<label
																			class="field__label"
																			for="mv-edit-notes-{entryKey(entry)}"
																		>
																			Notes
																		</label>
																		<input
																			class="field__input"
																			id="mv-edit-notes-{entryKey(entry)}"
																			name="notes"
																			placeholder="Optional"
																			value={entry.entryNotes ?? ''}
																		/>
																	</div>
																	<button class="button" type="submit">Save</button>
																	<button
																		class="link-action"
																		type="button"
																		onclick={() => (editingEntryKey = null)}
																	>
																		Cancel
																	</button>
																</form>
															</td>
														</tr>
													{:else}
														<tr>
															<td>{formatDate(entry.date)}</td>
															<td>
																<span
																	class="type-badge"
																	class:type-badge--deposit={entry.kind === 'deposit'}
																	class:type-badge--withdrawal={entry.kind === 'withdrawal'}
																	class:type-badge--initial={entry.kind === 'initial'}
																>
																	{entry.kind}
																</span>
															</td>
															<td>{entry.label}</td>
															<td
																class="table__cell--number"
																class:ledger__amount--negative={entry.kind === 'withdrawal'}
															>
																{entry.kind === 'withdrawal' ? '−' : '+'}{formatCents(
																	entry.amountCents
																)}
															</td>
															<td class="table__cell--number">
																{#if entry.entryId !== null && !entry.expenseLinked}
																	<div class="inline-form">
																		<button
																			class="link-action"
																			type="button"
																			onclick={() => (editingEntryKey = entryKey(entry))}
																		>
																			Edit
																		</button>
																		<form
																			method="POST"
																			action={entry.kind === 'deposit'
																				? '?/deleteDeposit'
																				: '?/deleteWithdrawal'}
																			use:enhance
																		>
																			<input type="hidden" name="id" value={entry.entryId} />
																			<button class="link-action" type="submit">Remove</button>
																		</form>
																	</div>
																{:else if entry.expenseLinked}
																	<span class="ledger__hint">from Expenses page</span>
																{:else if entry.kind === 'contribution'}
																	<span class="ledger__hint">from Income page</span>
																{:else}
																	<span class="ledger__hint">edit via “Edit” on the fund</span>
																{/if}
															</td>
														</tr>
													{/if}
												{/each}
											</tbody>
										</table>
									{/if}

									<form class="movement-form" method="POST" action="?/createDeposit" use:enhance>
										<input type="hidden" name="fundId" value={fund.id} />
										<div class="field">
											<label class="field__label" for="dp-amount-{fund.id}">New deposit</label>
											<input
												class="field__input"
												id="dp-amount-{fund.id}"
												name="amount"
												required
												placeholder="e.g. 500.00"
											/>
										</div>
										<div class="field">
											<label class="field__label" for="dp-date-{fund.id}">Date</label>
											<input
												class="field__input"
												id="dp-date-{fund.id}"
												name="date"
												type="date"
												required
												value={data.today}
											/>
										</div>
										<div class="field">
											<label class="field__label" for="dp-notes-{fund.id}">Notes</label>
											<input
												class="field__input"
												id="dp-notes-{fund.id}"
												name="notes"
												placeholder="Optional"
											/>
										</div>
										<button class="button" type="submit">Add deposit</button>
									</form>

									<form class="movement-form" method="POST" action="?/createWithdrawal" use:enhance>
										<input type="hidden" name="fundId" value={fund.id} />
										<div class="field">
											<label class="field__label" for="wd-amount-{fund.id}">New withdrawal</label>
											<input
												class="field__input"
												id="wd-amount-{fund.id}"
												name="amount"
												required
												placeholder="e.g. 500.00"
											/>
										</div>
										<div class="field">
											<label class="field__label" for="wd-date-{fund.id}">Date</label>
											<input
												class="field__input"
												id="wd-date-{fund.id}"
												name="date"
												type="date"
												required
												value={data.today}
											/>
										</div>
										<div class="field">
											<label class="field__label" for="wd-notes-{fund.id}">Notes</label>
											<input
												class="field__input"
												id="wd-notes-{fund.id}"
												name="notes"
												placeholder="Optional"
											/>
										</div>
										<button class="button" type="submit">Add withdrawal</button>
									</form>
								</div>
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

	.fund-description {
		display: block;
		color: $color-text-muted;
		font-size: $text-sm;
	}

	.sort-button {
		display: inline-flex;
		align-items: center;
		gap: $space-xs;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 500;
		color: $color-text-muted;
		cursor: pointer;

		&:hover {
			color: $color-text;
		}

		// Right-aligned like the number cells beneath it.
		&--number {
			width: 100%;
			justify-content: flex-end;
			font-family: $font-mono;
		}

		&__arrow {
			font-size: 0.7rem;
			opacity: 0.7;
		}
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: $space-sm;
		margin-bottom: $space-md;
		font-size: $text-sm;
		cursor: pointer;
	}

	.inline-form {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: $space-sm;
	}

	.confirm-text {
		font-size: $text-sm;
		color: $color-text-muted;
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

	.ledger {
		&__title {
			font-size: $text-base;
			margin-bottom: $space-sm;
		}

		&__empty {
			color: $color-text-muted;
			font-size: $text-sm;
			margin: 0 0 $space-md;
		}

		&__list {
			margin-bottom: $space-md;
			background: $color-surface;
			border-radius: $radius;
		}

		&__amount--negative {
			color: $color-danger;
		}

		&__hint {
			color: $color-text-muted;
			font-size: $text-sm;
		}
	}

	.type-badge {
		display: inline-block;
		padding: 0.1rem $space-sm;
		border-radius: $radius;
		background: rgba(61, 214, 140, 0.12);
		color: $color-success;
		font-size: $text-sm;

		&--deposit {
			background: rgba(61, 214, 140, 0.12);
			color: $color-success;
		}

		&--withdrawal {
			background: rgba(242, 85, 90, 0.12);
			color: $color-danger;
		}

		&--initial {
			background: rgba(124, 154, 255, 0.12);
			color: $color-primary;
		}
	}

	.movement-form {
		display: flex;
		align-items: flex-end;
		gap: $space-md;
		flex-wrap: wrap;

		.field {
			flex: 1;
			min-width: 140px;
			margin-bottom: 0;
		}

		+ .movement-form {
			margin-top: $space-md;
		}
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
