<script lang="ts">
	import { enhance } from '$app/forms';
	import ChartFigure from '$lib/components/ChartFigure.svelte';
	import FundCard from '$lib/components/FundCard.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';
	import { readChartTokens, seriesColor, seriesLegend } from '$lib/chart';
	import { theme } from '$lib/theme.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Fund = (typeof data.funds)[number];
	type ModalKind = 'add' | 'edit' | 'delete' | 'deposit' | 'withdraw';

	// One piece of state for all five modals — only ever one is open, and routing
	// them through a single value keeps "close on success" to a single assignment.
	let modal = $state<{ kind: ModalKind; fund: Fund | null } | null>(null);

	const modalTitles: Record<ModalKind, string> = {
		add: 'New fund',
		edit: 'Edit fund',
		delete: 'Delete fund',
		deposit: 'Add deposit',
		withdraw: 'Record withdrawal'
	};

	function openModal(kind: ModalKind, fund: Fund | null = null) {
		modal = { kind, fund };
	}

	/** `use:enhance` handler: apply the result, then close the modal if it succeeded. */
	const closeOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') modal = null;
		};
	};

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	const tokens = $derived.by(() => {
		void theme.resolved;
		return readChartTokens();
	});

	const labels = $derived([
		...data.history.map((p) => monthLabel(p.month)),
		...data.projection.map((p) => monthLabel(p.month))
	]);

	// The projection line starts at the last actual point so the two lines connect.
	const historySeries = $derived([
		...data.history.map((p) => p.cents / 100),
		...data.projection.map(() => null)
	]);
	const projectionSeries = $derived([
		...data.history.map((p, i) => (i === data.history.length - 1 ? p.cents / 100 : null)),
		...data.projection.map((p) => p.cents / 100)
	]);

	const chartData = $derived({
		labels,
		datasets: [
			{
				label: 'Net worth',
				data: historySeries,
				borderColor: seriesColor(tokens, 0),
				backgroundColor: `color-mix(in oklab, ${seriesColor(tokens, 0)} 18%, transparent)`,
				fill: true,
				tension: 0.25,
				pointRadius: 2
			},
			{
				label: `Projected (${data.projectionMonths} mo)`,
				data: projectionSeries,
				borderColor: seriesColor(tokens, 1),
				// Dashed as well as differently coloured: projected vs actual must not
				// rest on hue alone.
				borderDash: [6, 5],
				pointStyle: 'rectRot',
				pointRadius: 0,
				tension: 0
			}
		]
	});

	const chartOptions = $derived({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index' as const, intersect: false },
		plugins: {
			legend: seriesLegend(tokens),
			tooltip: {
				callbacks: {
					label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
						ctx.parsed.y === null
							? ''
							: `${ctx.dataset.label}: ${formatCents(Math.round(ctx.parsed.y * 100))}`
				}
			}
		},
		scales: {
			y: {
				ticks: {
					callback: (value: string | number) =>
						typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : value
				}
			}
		}
	});

	// Month-over-month change, for the headline tile.
	const monthDeltaCents = $derived(
		data.history.length >= 2
			? data.history[data.history.length - 1].cents - data.history[data.history.length - 2].cents
			: null
	);
</script>

<svelte:head>
	<title>Savings &amp; Net Worth · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Savings &amp; Net Worth</h1>
		<p class="explainer">
			Fund balances at cost basis — initial value plus contributions and deposits minus
			withdrawals. Market gains and losses are not tracked.
		</p>
	</div>
	<button class="button" type="button" onclick={() => openModal('add')}>Add fund</button>
</div>

<!-- Errors raised while a modal is open are repeated inside it; this catches the
     rest (e.g. a submission whose modal has already been dismissed). -->
{#if form?.error && modal === null}
	<p class="form-error" role="alert">{form.error}</p>
{/if}

<section class="stats" aria-label="Net worth summary">
	<StatTile
		label="Current net worth"
		value={formatCents(data.netWorthCents)}
		delta={monthDeltaCents}
		deltaLabel={monthDeltaCents !== null ? formatCents(Math.abs(monthDeltaCents)) : ''}
		hint="vs last month"
	/>
	<StatTile
		label="Avg monthly contribution{data.trendWindow > 0 ? ` (trailing ${data.trendWindow} mo)` : ''}"
		value={formatCents(data.avgMonthlyCents)}
	/>
	<StatTile
		label="Projected in {data.projectionMonths} months"
		value={formatCents(data.projectedCents)}
		hint="at the current contribution rate"
	/>
</section>

<section class="funds" aria-label="Funds">
	{#if data.funds.length === 0}
		<div class="card">
			<div class="empty-state">
				<p class="empty-state__title">No funds yet.</p>
				<p class="empty-state__hint">
					Add a fund, then funnel paychecks into it from the Income page.
				</p>
				<div class="empty-state__actions">
					<button class="button" type="button" onclick={() => openModal('add')}>Add fund</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="fund-grid">
			{#each data.funds as fund (fund.id)}
				<FundCard
					{fund}
					currentMonth={data.currentMonth}
					onedit={(f) => openModal('edit', f)}
					ondelete={(f) => openModal('delete', f)}
					ondeposit={(f) => openModal('deposit', f)}
					onwithdraw={(f) => openModal('withdraw', f)}
				/>
			{/each}
		</div>
	{/if}
</section>

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
		<span class="field__hint">
			Starting balance from before you began tracking. Leave blank for $0.
		</span>
	</div>
	<label class="checkbox">
		<input type="checkbox" name="isSavings" checked={fund?.isSavings ?? true} />
		Savings / investment fund (contributions accumulate)
	</label>
{/snippet}

{#snippet movementFields(idPrefix: string, amountLabel: string)}
	<div class="field">
		<label class="field__label" for="{idPrefix}-amount">{amountLabel}</label>
		<input
			class="field__input"
			id="{idPrefix}-amount"
			name="amount"
			required
			placeholder="e.g. 500.00"
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
			value={data.today}
		/>
	</div>
	<div class="field">
		<label class="field__label" for="{idPrefix}-notes">Notes (optional)</label>
		<input class="field__input" id="{idPrefix}-notes" name="notes" placeholder="Optional" />
	</div>
{/snippet}

<Modal
	title={modal ? modalTitles[modal.kind] : ''}
	bind:open={() => modal !== null, (v) => { if (!v) modal = null; }}
>
	<!-- Keyed on the open modal: after a save the form resets and its DOM inputs
	     empty, so reopening the same fund must remount the form to show fresh
	     values rather than the blanked-out ones. -->
	{#key `${modal?.kind}-${modal?.fund?.id}`}
		{#if form?.error}
			<p class="form-error" role="alert">{form.error}</p>
		{/if}

		{#if modal?.kind === 'add'}
			<form method="POST" action="?/createFund" use:enhance={closeOnSuccess}>
				{@render fundFields(null, 'new')}
				<button class="button" type="submit">Add fund</button>
			</form>
		{:else if modal?.kind === 'edit' && modal.fund}
			<form method="POST" action="?/updateFund" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={modal.fund.id} />
				{@render fundFields(modal.fund, `edit-${modal.fund.id}`)}
				<button class="button" type="submit">Save changes</button>
			</form>
		{:else if modal?.kind === 'delete' && modal.fund}
			<form method="POST" action="?/deleteFund" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={modal.fund.id} />
				<p class="confirm">
					Delete <strong>{modal.fund.name}</strong>? Its paycheck allocations, deposits and
					withdrawals are deleted with it. This cannot be undone.
				</p>
				<div class="confirm__actions">
					<button class="button button--secondary" type="button" onclick={() => (modal = null)}>
						Cancel
					</button>
					<button class="button button--danger" type="submit">Delete fund</button>
				</div>
			</form>
		{:else if modal?.kind === 'deposit' && modal.fund}
			<form method="POST" action="?/createDeposit" use:enhance={closeOnSuccess}>
				<input type="hidden" name="fundId" value={modal.fund.id} />
				<p class="modal-subject">Into <strong>{modal.fund.name}</strong></p>
				{@render movementFields(`dp-${modal.fund.id}`, 'Deposit amount')}
				<button class="button" type="submit">Add deposit</button>
			</form>
		{:else if modal?.kind === 'withdraw' && modal.fund}
			<form method="POST" action="?/createWithdrawal" use:enhance={closeOnSuccess}>
				<input type="hidden" name="fundId" value={modal.fund.id} />
				<p class="modal-subject">Out of <strong>{modal.fund.name}</strong></p>
				{@render movementFields(`wd-${modal.fund.id}`, 'Withdrawal amount')}
				<button class="button" type="submit">Record withdrawal</button>
			</form>
		{/if}
	{/key}
</Modal>

<!-- The net worth trend sits last on the page, below the funds it aggregates. -->
<div class="card chart-card">
	{#if data.history.length === 0}
		<p class="empty-state">
			No fund movements yet. Funnel paychecks into funds on the Income page and the trend will
			appear here.
		</p>
	{:else}
		<ChartFigure
			title="Net worth over time"
			description="Running total across every fund, with a dashed {data.projectionMonths}-month projection at the recent contribution rate."
			type="line"
			data={chartData}
			options={chartOptions}
			height="360px"
		/>
	{/if}
</div>

<style lang="scss">
	@use 'breakpoints' as *;

	.explainer {
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		max-width: 72ch;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.funds {
		margin-bottom: var(--space-4);
	}

	// `minmax(0, 1fr)` rather than `1fr`: grid items default to `min-width: auto`,
	// so a card holding a long fund name refuses to shrink and overflows its track.
	.fund-grid {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: 1fr;

		@media (min-width: $breakpoint-md) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		@media (min-width: $breakpoint-lg) {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.modal-subject {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-sm);

		strong {
			color: var(--text-primary);
		}
	}

	.confirm {
		margin: 0 0 var(--space-5);
		font-size: var(--text-base);
		line-height: 1.5;

		&__actions {
			display: flex;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: var(--space-2);
		}
	}

	// Server-side validation message. The left rule and the alert role carry it as
	// well as the colour does.
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
