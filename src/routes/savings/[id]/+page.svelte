<script lang="ts">
	import { enhance } from '$app/forms';
	import PeriodFilter from '$lib/components/PeriodFilter.svelte';
	import { scrollable } from '$lib/actions';
	import { formatCents } from '$lib/money';
	import { formatDate } from '$lib/date';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = (typeof data.ledger)[number];

	// Which ledger entry is being edited inline, as "<kind>:<id>" — deposit and
	// withdrawal ids are separate sequences, so the kind is part of the key.
	let editingEntryKey = $state<string | null>(null);

	function entryKey(entry: Entry): string {
		return `${entry.kind}:${entry.entryId}`;
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	/** Amount with an explicit sign, so polarity survives without colour. */
	function signed(cents: number, negative: boolean): string {
		return `${negative ? '−' : '+'}${formatCents(Math.abs(cents))}`;
	}
</script>

<svelte:head>
	<title>{data.fund.name} · Savings &amp; Net Worth · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<div>
		<a class="back-link" href="/savings">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M19 12H5m0 0 6-6m-6 6 6 6" />
			</svg>
			Savings &amp; Net Worth
		</a>
		<h1>{data.fund.name}</h1>
		{#if data.fund.description}
			<p class="explainer">{data.fund.description}</p>
		{/if}
	</div>
	<p class="balance">
		<span class="balance__label">Current balance</span>
		<span class="balance__value">{formatCents(data.fund.balanceCents)}</span>
	</p>
</div>

{#if form?.error}
	<p class="form-error" role="alert">{form.error}</p>
{/if}

<section class="card ledger-card" aria-labelledby="ledger-heading">
	<div class="ledger-card__head">
		<h2 id="ledger-heading">Transactions</h2>
		<PeriodFilter
			options={data.periodOptions}
			value={data.period}
			paramName="period"
			label="Period for this fund's transactions"
		/>
	</div>

	<dl class="period-summary">
		<div class="period-summary__item">
			<dt>In</dt>
			<dd class="period-summary__value period-summary__value--pos">
				{signed(data.totals.inCents, false)}
			</dd>
		</div>
		<div class="period-summary__item">
			<dt>Out</dt>
			<dd class="period-summary__value period-summary__value--neg">
				{signed(data.totals.outCents, true)}
			</dd>
		</div>
		<div class="period-summary__item">
			<dt>Net</dt>
			<dd
				class="period-summary__value"
				class:period-summary__value--pos={data.totals.netCents > 0}
				class:period-summary__value--neg={data.totals.netCents < 0}
			>
				{signed(data.totals.netCents, data.totals.netCents < 0)}
			</dd>
		</div>
		<div class="period-summary__item">
			<dt>Period</dt>
			<dd class="period-summary__value">{data.periodLabel}</dd>
		</div>
	</dl>

	{#if data.ledger.length === 0}
		{#if data.hasAnyMovements}
			<p class="empty-state">
				No movements in the selected period ({data.periodLabel}).
				<a href="?period=all">Show all time</a> to see this fund's full history.
			</p>
		{:else}
			<p class="empty-state">
				This fund has no movements at all. Contributions come from paycheck allocations on the
				Income page; deposits and withdrawals are recorded on the Savings &amp; Net Worth page.
			</p>
		{/if}
	{:else}
		<div class="table-scroll" use:scrollable={'Fund transactions table'}>
			<table class="table">
				<caption class="visually-hidden">
					Movements for {data.fund.name} — {data.periodLabel}
				</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">Type</th>
						<th scope="col">Description</th>
						<th scope="col" class="table__cell--number">Amount</th>
						<th scope="col" class="table__cell--number">
							<span class="visually-hidden">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.ledger as entry (entry.kind + (entry.entryId ?? entry.date + entry.label + entry.amountCents))}
						{#if entry.entryId !== null && editingEntryKey === entryKey(entry)}
							<tr>
								<td colspan="5">
									<form
										class="movement-form"
										method="POST"
										action={entry.kind === 'deposit' ? '?/updateDeposit' : '?/updateWithdrawal'}
										use:enhance={() =>
											({ update }) => {
												editingEntryKey = null;
												update();
											}}
									>
										<input type="hidden" name="id" value={entry.entryId} />
										<div class="field">
											<label class="field__label" for="mv-edit-amount-{entryKey(entry)}">
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
											<label class="field__label" for="mv-edit-date-{entryKey(entry)}">Date</label>
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
											<label class="field__label" for="mv-edit-notes-{entryKey(entry)}">Notes</label>
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
									{signed(entry.amountCents, entry.kind === 'withdrawal')}
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
												action={entry.kind === 'deposit' ? '?/deleteDeposit' : '?/deleteWithdrawal'}
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
										<span class="ledger__hint">edit the fund on Savings &amp; Net Worth</span>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style lang="scss">
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-sm);

		svg {
			inline-size: 16px;
			block-size: 16px;
		}
	}

	.balance {
		margin: 0;
		text-align: right;
		// Grid/flex siblings shrink below their content otherwise.
		flex-shrink: 0;

		&__label {
			display: block;
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}

		&__value {
			display: block;
			font-size: var(--text-xl);
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}
	}

	.ledger-card {
		&__head {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: var(--space-4);
			flex-wrap: wrap;

			h2 {
				margin-bottom: var(--space-4);
			}
		}
	}

	// In / out / net for the selected period. Every figure carries an explicit
	// + or − so the polarity reads without colour.
	.period-summary {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5);
		margin: 0 0 var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);

		dt {
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}

		dd {
			margin: 0;
		}

		&__value {
			font-weight: 600;
			font-variant-numeric: tabular-nums;

			&--pos {
				color: var(--pos);
			}

			&--neg {
				color: var(--neg);
			}
		}
	}

	.ledger__amount--negative {
		color: var(--neg);
	}

	.ledger__hint {
		color: var(--text-secondary);
		font-size: var(--text-sm);
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

	.inline-form {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
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
	}
</style>
