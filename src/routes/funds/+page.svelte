<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import SortableHeader from '$lib/components/SortableHeader.svelte';
	import { scrollable } from '$lib/actions';
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
</script>

<svelte:head>
	<title>Funds · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<h1>Funds</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add fund</button>
</div>

{#if form?.error}
	<p class="form-error" role="alert">{form.error}</p>
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
		<p class="form-error" role="alert">{form.error}</p>
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
		<p class="form-error" role="alert">{form.error}</p>
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
		<div class="empty-state">
			<p class="empty-state__title">No funds yet.</p>
			<p class="empty-state__hint">
				Add a fund, then funnel paychecks into it from the Income page.
			</p>
			<div class="empty-state__actions">
				<button class="button" type="button" onclick={() => (showAddModal = true)}>Add fund</button>
			</div>
		</div>
	{:else}
		<div class="table-scroll" use:scrollable={'Funds table'}>
		<table class="table table--dense">
			<caption class="visually-hidden">
				{data.funds.length} funds with their initial value, contributions, deposits, withdrawals and
				current balance. Every row can be expanded to show its ledger.
			</caption>
			<thead>
				<tr class="table__head">
					<th scope="col" class="table__cell--caret">
						<span class="visually-hidden">Expand ledger</span>
					</th>
					<SortableHeader label="Fund" sortKey="name" activeKey={sortKey} direction={sortDir} onsort={setSort} />
					<SortableHeader label="Savings?" sortKey="isSavings" activeKey={sortKey} direction={sortDir} onsort={setSort} />
					<SortableHeader label="Initial" sortKey="initialCents" activeKey={sortKey} direction={sortDir} align="end" onsort={setSort} />
					<SortableHeader label="Contributed" sortKey="contributedCents" activeKey={sortKey} direction={sortDir} align="end" onsort={setSort} />
					<SortableHeader label="Deposited" sortKey="depositedCents" activeKey={sortKey} direction={sortDir} align="end" onsort={setSort} />
					<SortableHeader label="Withdrawn" sortKey="withdrawnCents" activeKey={sortKey} direction={sortDir} align="end" onsort={setSort} />
					<SortableHeader label="Balance" sortKey="balanceCents" activeKey={sortKey} direction={sortDir} align="end" onsort={setSort} />
					<th scope="col"><span class="visually-hidden">Actions</span></th>
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
								<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
									<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
						</td>
						<th scope="row" class="table__cell--name">
							{fund.name}
							{#if fund.description}
								<span class="fund-description">{fund.description}</span>
							{/if}
						</th>
						<td>{fund.isSavings ? 'Yes' : 'No'}</td>
						<td class="table__cell--number">{formatCents(fund.initialCents)}</td>
						<td class="table__cell--number">{formatCents(fund.contributedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.depositedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.withdrawnCents)}</td>
						<td class="table__cell--number table__cell--emphasis">
							{formatCents(fund.balanceCents)}
						</td>
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
		</div>
	{/if}
</div>

<style lang="scss">
	
	.fund-description {
		display: block;
		margin-top: 2px;
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: 1.35;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.inline-form {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.table__cell--caret {
		width: 2.25rem;
		padding-right: 0;
	}

	.table__cell--name {
		font-weight: 500;
		// Nine columns compete for width; without a floor the name column collapses
		// and every description wraps to three or four lines.
		min-inline-size: 10.5rem;
	}

	.ledger {
		&__title {
			font-size: var(--text-base);
			margin-bottom: var(--space-2);
		}

		&__empty {
			color: var(--text-secondary);
			font-size: var(--text-sm);
			margin: 0 0 var(--space-4);
		}

		&__list {
			margin-bottom: var(--space-4);
			background: var(--surface-1);
			border: 1px solid var(--border-subtle);
			border-radius: var(--radius-md);
			overflow: hidden;
		}

		&__amount--negative {
			color: var(--neg);
		}

		&__hint {
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}
	}

	// Movement type. The badge text names the kind, so colour is reinforcement here
	// rather than the only signal.
	.type-badge {
		display: inline-block;
		padding: 0.1rem var(--space-2);
		border-radius: var(--radius-full);
		background: var(--pos-soft);
		color: var(--pos);
		font-size: var(--text-xs);
		font-weight: 500;
		text-transform: capitalize;

		&--deposit {
			background: var(--pos-soft);
			color: var(--pos);
		}

		&--withdrawal {
			background: var(--neg-soft);
			color: var(--neg);
		}

		&--initial {
			background: var(--accent-soft);
			color: var(--accent);
		}
	}

	.movement-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;

		.field {
			flex: 1;
			min-width: 140px;
			margin-bottom: 0;
		}

		+ .movement-form {
			margin-top: var(--space-4);
		}
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
</style>
