<script lang="ts">
	/**
	 * One fund, as a card in the Savings grid.
	 *
	 * Prominence order is deliberate: the balance is the number people come for, the
	 * month-to-date contribution answers "am I still feeding this?", and the four
	 * lifetime totals are reference detail at the bottom.
	 *
	 * The four actions are icon-only and revealed on hover — so they also appear on
	 * `:focus-within` (keyboard) and permanently where there is no hover (touch).
	 */
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';

	type Fund = {
		id: number;
		name: string;
		description: string | null;
		isSavings: boolean;
		initialCents: number;
		contributedCents: number;
		depositedCents: number;
		withdrawnCents: number;
		mtdContributedCents: number;
		balanceCents: number;
		contributionCount: number;
		depositCount: number;
		withdrawalCount: number;
	};

	let {
		fund,
		currentMonth,
		onedit,
		ondelete,
		ondeposit,
		onwithdraw
	}: {
		fund: Fund;
		/** YYYY-MM the "contributed month-to-date" figure covers. */
		currentMonth: string;
		onedit: (fund: Fund) => void;
		ondelete: (fund: Fund) => void;
		ondeposit: (fund: Fund) => void;
		onwithdraw: (fund: Fund) => void;
	} = $props();

	const movementCount = $derived(
		fund.contributionCount + fund.depositCount + fund.withdrawalCount
	);
</script>

<article class="fund-card">
	<header class="fund-card__head">
		<div class="fund-card__ident">
			<h2 class="fund-card__name">{fund.name}</h2>
			{#if fund.isSavings}
				<!-- Text, not a colour swatch: the word is what carries the meaning. -->
				<span class="fund-card__badge">Savings</span>
			{/if}
			{#if fund.description}
				<p class="fund-card__description">{fund.description}</p>
			{/if}
		</div>

		<div class="fund-card__actions">
			<button
				class="icon-action"
				type="button"
				aria-label="Edit {fund.name}"
				title="Edit {fund.name}"
				onclick={() => onedit(fund)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path
						d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button
				class="icon-action"
				type="button"
				aria-label="Add deposit to {fund.name}"
				title="Add deposit to {fund.name}"
				onclick={() => ondeposit(fund)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path
						d="M12 5v14M5 12h14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button
				class="icon-action"
				type="button"
				aria-label="Record withdrawal from {fund.name}"
				title="Record withdrawal from {fund.name}"
				onclick={() => onwithdraw(fund)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path
						d="M5 12h14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button
				class="icon-action icon-action--danger"
				type="button"
				aria-label="Delete {fund.name}"
				title="Delete {fund.name}"
				onclick={() => ondelete(fund)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path
						d="M4 7h16M10 7V5h4v2m-8 0 1 13h10l1-13M10 11v6M14 11v6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	</header>

	<p class="fund-card__balance money">{formatCents(fund.balanceCents)}</p>
	<p class="fund-card__balance-label">Current balance</p>

	<p class="fund-card__mtd">
		<span class="fund-card__mtd-label">Contributed in {monthLabel(currentMonth)}</span>
		<span class="fund-card__mtd-value money">{formatCents(fund.mtdContributedCents)}</span>
	</p>

	<dl class="fund-card__totals">
		<div class="fund-card__total">
			<dt>Initial</dt>
			<dd class="money">{formatCents(fund.initialCents)}</dd>
		</div>
		<div class="fund-card__total">
			<dt>Contributed</dt>
			<dd class="money">{formatCents(fund.contributedCents)}</dd>
		</div>
		<div class="fund-card__total">
			<dt>Deposited</dt>
			<dd class="money">{formatCents(fund.depositedCents)}</dd>
		</div>
		<div class="fund-card__total">
			<dt>Withdrawn</dt>
			<dd class="money">{formatCents(fund.withdrawnCents)}</dd>
		</div>
	</dl>

	<a class="fund-card__link" href="/savings/{fund.id}">
		View all transactions
		<span class="fund-card__count">
			{movementCount}
			{movementCount === 1 ? 'movement' : 'movements'}
		</span>
	</a>
</article>

<style lang="scss">
	.fund-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-1);
		// A long fund name must not push the card past its grid track.
		min-inline-size: 0;

		// The action row keeps its own line rather than sharing one with the title.
		// It is ~108px wide and is laid out whether or not it is visible, so putting
		// it beside the name left a 4-up card barely 70px for the name — every fund
		// wrapped to three lines. Its own line costs one stable row of height and
		// never shifts on hover.
		&__head {
			display: flex;
			flex-wrap: wrap;
			align-items: flex-start;
			gap: var(--space-1) var(--space-2);
		}

		&__ident {
			display: flex;
			flex: 1 1 100%;
			flex-wrap: wrap;
			align-items: baseline;
			gap: var(--space-1) var(--space-2);
			min-inline-size: 0;
		}

		&__name {
			margin: 0;
			font-size: var(--text-base);
			font-weight: 600;
			line-height: 1.3;
			// Long names wrap rather than overflow. `break-word`, not `anywhere`:
			// `anywhere` also shrinks min-content, and the 4-up card is narrow enough
			// that it starts breaking ordinary words letter by letter.
			overflow-wrap: break-word;
		}

		&__badge {
			flex: none;
			padding: 0.1rem var(--space-2);
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-full);
			background: var(--surface-2);
			color: var(--text-secondary);
			font-size: var(--text-xs);
			font-weight: 500;
			white-space: nowrap;
		}

		&__description {
			flex-basis: 100%;
			margin: 0;
			color: var(--text-tertiary);
			font-size: var(--text-xs);
			line-height: 1.4;
			overflow-wrap: break-word;
		}

		&__balance {
			margin: var(--space-2) 0 0;
			font-size: var(--text-xl);
			font-weight: 650;
			line-height: 1.1;
			letter-spacing: -0.03em;
			color: var(--text-primary);
		}

		&__balance-label {
			margin: 0;
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}

		// Label above value rather than a justified row: at 4-up the card is ~230px
		// wide, where a justified label/value pair wraps into the same two lines
		// anyway — but unpredictably.
		&__mtd {
			display: flex;
			flex-direction: column;
			gap: var(--space-1);
			margin: var(--space-2) 0 0;
			padding-top: var(--space-3);
			border-top: 1px solid var(--border-subtle);
			font-size: var(--text-base);
		}

		&__mtd-label {
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}

		&__mtd-value {
			font-weight: 600;
		}

		// One label/value row per line. Two columns were tried first and collapse at
		// the 4-up card width — "Contributed" ends up breaking letter by letter.
		&__totals {
			display: grid;
			gap: var(--space-1);
			margin: var(--space-2) 0 0;
			font-size: var(--text-sm);
			color: var(--text-secondary);
		}

		&__total {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: var(--space-2);
			min-inline-size: 0;

			dt {
				overflow-wrap: break-word;
			}

			dd {
				margin: 0;
				color: var(--text-primary);
			}
		}

		&__link {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-2);
			min-block-size: var(--target-min);
			margin-top: auto;
			padding-top: var(--space-3);
			border-top: 1px solid var(--border-subtle);
			font-size: var(--text-sm);
			font-weight: 500;
		}

		&__count {
			color: var(--text-tertiary);
			font-weight: 400;
			font-variant-numeric: tabular-nums;
		}
	}

	// Hover-revealed, but never hover-only: keyboard focus anywhere in the card
	// reveals them, and a device without hover shows them permanently.
	.fund-card__actions {
		display: flex;
		flex: none;
		margin-inline-start: auto;
		gap: var(--space-1);
		opacity: 0;
		transition: opacity var(--dur-fast) var(--ease-out);

		.fund-card:hover &,
		.fund-card:focus-within & {
			opacity: 1;
		}

		@media (hover: none) {
			opacity: 1;
		}
	}

	.icon-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--target-min);
		block-size: var(--target-min);
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			background-color var(--dur-fast) var(--ease-out);

		&:hover {
			color: var(--text-primary);
			background: var(--surface-2);
		}

		// A focused control must be visible even before the reveal transition ends.
		&:focus-visible {
			opacity: 1;
		}

		&--danger:hover {
			color: var(--neg);
		}

		svg {
			inline-size: 15px;
			block-size: 15px;
		}
	}
</style>
