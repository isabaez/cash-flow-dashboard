<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import { formatBps, formatCents } from '$lib/money';
	import { formatDate } from '$lib/date';
	import { scrollable } from '$lib/actions';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Paycheck = (typeof data.paychecks)[number];

	const OWNERS = ['me', 'spouse'];

	// Whether the "add paycheck" modal is open.
	let showAddModal = $state(false);
	// Paycheck being edited in the edit modal.
	let editing = $state<Paycheck | null>(null);
	let showEditModal = $state(false);
	// Paycheck being duplicated in the duplicate modal.
	let duplicating = $state<Paycheck | null>(null);
	let showDuplicateModal = $state(false);
	// Which paycheck is pending delete confirmation.
	let deletingId = $state<number | null>(null);
	// Which paycheck's detail panel (deductions + allocations) is expanded.
	let expandedId = $state<number | null>(null);

	// Kind/basis of the deduction currently being added (drives conditional inputs).
	let newDeductionKind = $state<'fixed' | 'percent'>('fixed');
	let newDeductionBasis = $state<'gross' | 'net'>('gross');
	// Which deduction is being edited inline, and its form's kind/basis.
	let editingDeductionId = $state<number | null>(null);
	let editDeductionKind = $state<'fixed' | 'percent'>('fixed');
	let editDeductionBasis = $state<'gross' | 'net'>('gross');

	// Same pattern for allocations.
	let newAllocationKind = $state<'fixed' | 'percent'>('percent');
	let newAllocationBasis = $state<'gross' | 'net'>('net');
	let editingAllocationId = $state<number | null>(null);
	let editAllocationKind = $state<'fixed' | 'percent'>('percent');
	let editAllocationBasis = $state<'gross' | 'net'>('net');

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	function openEdit(paycheck: Paycheck) {
		editing = paycheck;
		deletingId = null;
		showEditModal = true;
	}

	function openDuplicate(paycheck: Paycheck) {
		duplicating = paycheck;
		deletingId = null;
		showDuplicateModal = true;
	}

	function startEditDeduction(deduction: Paycheck['deductions'][number]) {
		editingDeductionId = deduction.id;
		editDeductionKind = deduction.kind === 'percent' ? 'percent' : 'fixed';
		editDeductionBasis = deduction.basis === 'net' ? 'net' : 'gross';
	}

	function startEditAllocation(allocation: Paycheck['allocations'][number]) {
		editingAllocationId = allocation.id;
		editAllocationKind = allocation.kind === 'percent' ? 'percent' : 'fixed';
		editAllocationBasis = allocation.basis === 'net' ? 'net' : 'gross';
	}

	/** Net take-home: gross minus the stored resolved deduction amounts. */
	function netCents(paycheck: Paycheck): number {
		return paycheck.deductions.reduce((net, d) => net - d.resolvedCents, paycheck.grossCents);
	}

	/** Total funneled into funds from this paycheck. */
	function allocatedCents(paycheck: Paycheck): number {
		return paycheck.allocations.reduce((sum, a) => sum + a.resolvedCents, 0);
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	/** "fixed" -> "$250.00" ; percent -> "6.5% of gross" */
	function ruleLabel(rule: { kind: string; basis: string; value: number }): string {
		return rule.kind === 'percent'
			? `${formatBps(rule.value)} of ${rule.basis}`
			: formatCents(rule.value);
	}
</script>

<svelte:head>
	<title>Income · Cash Flow</title>
</svelte:head>

<div class="page-header">
	<h1>Income</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add paycheck</button>
</div>

<FilterBar
	months={data.availableMonths}
	years={data.availableYears}
	month={data.filters.month}
	year={data.filters.year}
/>

{#if form?.error}
	<p class="form-error" role="alert">{form.error}</p>
{/if}

{#snippet paycheckFields(paycheck: Paycheck | null, idPrefix: string)}
	<div class="paycheck-form__grid">
		<div class="field">
			<label class="field__label" for="{idPrefix}-title">Source</label>
			<input
				class="field__input"
				id="{idPrefix}-title"
				name="title"
				required
				placeholder="e.g. Acme payroll"
				value={paycheck?.title ?? ''}
			/>
		</div>
		<div class="field">
			<label class="field__label" for="{idPrefix}-gross">Gross amount</label>
			<input
				class="field__input"
				id="{idPrefix}-gross"
				name="gross"
				required
				placeholder="e.g. 5,000.00"
				value={paycheck ? dollars(paycheck.grossCents) : ''}
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
				value={paycheck?.date ?? data.today}
			/>
		</div>
		<div class="field">
			<label class="field__label" for="{idPrefix}-owner">Owner</label>
			<select class="field__input" id="{idPrefix}-owner" name="owner">
				{#each OWNERS as owner}
					<option value={owner} selected={owner === (paycheck?.owner ?? 'me')}>{owner}</option>
				{/each}
			</select>
		</div>
	</div>
	<div class="field">
		<label class="field__label" for="{idPrefix}-notes">Notes (optional)</label>
		<textarea class="field__input" id="{idPrefix}-notes" name="notes" rows="2" placeholder="Optional"
			>{paycheck?.notes ?? ''}</textarea>
	</div>
{/snippet}

<Modal bind:open={showAddModal} title="New paycheck">
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	{#key showAddModal}
		<form
			method="POST"
			action="?/createPaycheck"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showAddModal = false;
				}}
		>
			{@render paycheckFields(null, 'new')}
			<p class="hint">Deductions and fund allocations are added from the paycheck's detail panel.</p>
			<button class="button" type="submit">Add paycheck</button>
		</form>
	{/key}
</Modal>

<Modal bind:open={showEditModal} title="Edit paycheck">
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	<!-- Key on the open flag too: the post-save form reset empties the DOM inputs,
	     so reopening the same paycheck must remount the form with fresh values. -->
	{#key `${showEditModal}-${editing?.id}`}
		{#if editing}
			<form
				method="POST"
				action="?/updatePaycheck"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') showEditModal = false;
					}}
			>
				<input type="hidden" name="id" value={editing.id} />
				{@render paycheckFields(editing, `edit-${editing.id}`)}
				<button class="button" type="submit">Save changes</button>
			</form>
		{/if}
	{/key}
</Modal>

<Modal bind:open={showDuplicateModal} title="Duplicate paycheck">
	{#if form?.error}
		<p class="form-error" role="alert">{form.error}</p>
	{/if}
	{#key showDuplicateModal}
	{#if duplicating}
		<p class="hint">
			Copies “{duplicating.title}” ({formatCents(duplicating.grossCents)} gross) with
			{duplicating.deductions.length}
			{duplicating.deductions.length === 1 ? 'deduction' : 'deductions'} and
			{duplicating.allocations.length} fund
			{duplicating.allocations.length === 1 ? 'allocation' : 'allocations'}. Adjust the source and date below.
		</p>
		<form
			method="POST"
			action="?/duplicatePaycheck"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') showDuplicateModal = false;
				}}
		>
			<input type="hidden" name="id" value={duplicating.id} />
			<div class="field">
				<label class="field__label" for="duplicate-title">Source</label>
				<input
					class="field__input"
					id="duplicate-title"
					name="title"
					required
					value={duplicating.title}
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

<div class="card">
	{#if data.paychecks.length === 0}
		<div class="empty-state">
			{#if data.filters.month || data.filters.year}
				<p class="empty-state__title">No paychecks match the current filters.</p>
				<p class="empty-state__hint">Clear a filter above to widen the search.</p>
			{:else}
				<p class="empty-state__title">No paychecks yet.</p>
				<p class="empty-state__hint">
					Add one, then break it into deductions and fund allocations.
				</p>
			{/if}
		</div>
	{:else}
		<div class="table-scroll" use:scrollable={'Paychecks table'}>
		<table class="table table--dense">
			<caption class="visually-hidden">
				{data.paychecks.length} paychecks, newest first, showing gross pay, net after deductions and
				the amount funnelled into funds. Every row can be expanded to edit its deductions and
				allocations.
			</caption>
			<thead>
				<tr class="table__head">
					<th scope="col" class="table__cell--caret">
						<span class="visually-hidden">Expand row</span>
					</th>
					<th scope="col">Date</th>
					<th scope="col">Source</th>
					<th scope="col">Owner</th>
					<th scope="col" class="table__cell--number">Gross</th>
					<th scope="col" class="table__cell--number">Net</th>
					<th scope="col" class="table__cell--number">Allocated</th>
					<th scope="col"><span class="visually-hidden">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.paychecks as paycheck (paycheck.id)}
					<tr>
						<td class="table__cell--caret">
							<button
								class="caret"
								class:caret--open={expandedId === paycheck.id}
								type="button"
								aria-expanded={expandedId === paycheck.id}
								aria-label="Toggle deductions and allocations for {paycheck.title}"
								onclick={() => toggleExpanded(paycheck.id)}
							>
								<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
									<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
						</td>
						<td class="table__cell--date">{formatDate(paycheck.date)}</td>
						<th scope="row" class="table__cell--name">{paycheck.title}</th>
						<td>{paycheck.owner}</td>
						<td class="table__cell--number">{formatCents(paycheck.grossCents)}</td>
						<td class="table__cell--number table__cell--emphasis">
							{formatCents(netCents(paycheck))}
						</td>
						<td class="table__cell--number">{formatCents(allocatedCents(paycheck))}</td>
						<td>
							{#if deletingId === paycheck.id}
								<form
									class="inline-form"
									method="POST"
									action="?/deletePaycheck"
									use:enhance={() =>
										({ update }) => {
											deletingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={paycheck.id} />
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
									<button class="link-action" type="button" onclick={() => openEdit(paycheck)}>
										Edit
									</button>
									<button
										class="link-action"
										type="button"
										onclick={() => openDuplicate(paycheck)}
									>
										Duplicate
									</button>
									<button
										class="link-action link-action--danger"
										type="button"
										onclick={() => (deletingId = paycheck.id)}
									>
										Delete
									</button>
								</div>
							{/if}
						</td>
					</tr>

					{#if expandedId === paycheck.id}
						<tr class="detail-row">
							<td colspan="8">
								<div class="detail">
									<section class="detail__section">
										<h3 class="detail__title">Deductions</h3>

										{#if paycheck.deductions.length === 0}
											<p class="detail__empty">No deductions on this paycheck yet.</p>
										{:else}
											<table class="table detail__list">
												<tbody>
													{#each paycheck.deductions as deduction (deduction.id)}
														{#if editingDeductionId === deduction.id}
															<tr>
																<td colspan="5">
																	<form
																		class="rule-form"
																		method="POST"
																		action="?/updateDeduction"
																		use:enhance={() =>
																			({ update }) => {
																				editingDeductionId = null;
																				update();
																			}}
																	>
																		<input type="hidden" name="id" value={deduction.id} />
																		<div class="field">
																			<label class="field__label" for="ded-edit-title-{deduction.id}">
																				Deduction
																			</label>
																			<input
																				class="field__input"
																				id="ded-edit-title-{deduction.id}"
																				name="title"
																				required
																				value={deduction.title}
																			/>
																		</div>
																		<div class="field">
																			<label class="field__label" for="ded-edit-kind-{deduction.id}">
																				Type
																			</label>
																			<select
																				class="field__input"
																				id="ded-edit-kind-{deduction.id}"
																				name="kind"
																				bind:value={editDeductionKind}
																			>
																				<option value="fixed">Fixed ($)</option>
																				<option value="percent">Percent (%)</option>
																			</select>
																		</div>
																		{#if editDeductionKind === 'percent'}
																			<div class="field">
																				<label class="field__label" for="ded-edit-basis-{deduction.id}">
																					Basis
																				</label>
																				<select
																					class="field__input"
																					id="ded-edit-basis-{deduction.id}"
																					name="basis"
																					bind:value={editDeductionBasis}
																				>
																					<option value="gross">% of gross</option>
																					<option value="net">% of net</option>
																				</select>
																			</div>
																		{/if}
																		<div class="field">
																			<label class="field__label" for="ded-edit-value-{deduction.id}">
																				{editDeductionKind === 'percent' ? 'Percentage' : 'Amount'}
																			</label>
																			<input
																				class="field__input"
																				id="ded-edit-value-{deduction.id}"
																				name="value"
																				required
																				value={deduction.kind === 'percent'
																					? deduction.value / 100
																					: dollars(deduction.value)}
																			/>
																		</div>
																		<button class="button" type="submit">Save</button>
																		<button
																			class="link-action"
																			type="button"
																			onclick={() => (editingDeductionId = null)}
																		>
																			Cancel
																		</button>
																	</form>
																</td>
															</tr>
														{:else}
															<tr>
																<td>{deduction.title}</td>
																<td><span class="badge">{ruleLabel(deduction)}</span></td>
																<td class="table__cell--number">
																	−{formatCents(deduction.resolvedCents)}
																</td>
																<td class="table__cell--number">
																	<div class="inline-form">
																		<button
																			class="link-action"
																			type="button"
																			onclick={() => startEditDeduction(deduction)}
																		>
																			Edit
																		</button>
																		<form method="POST" action="?/deleteDeduction" use:enhance>
																			<input type="hidden" name="id" value={deduction.id} />
																			<button class="link-action" type="submit">Remove</button>
																		</form>
																	</div>
																</td>
															</tr>
														{/if}
													{/each}
												</tbody>
											</table>
										{/if}

										<form class="rule-form" method="POST" action="?/createDeduction" use:enhance>
											<input type="hidden" name="paycheckId" value={paycheck.id} />
											<div class="field">
												<label class="field__label" for="ded-title-{paycheck.id}">New deduction</label>
												<input
													class="field__input"
													id="ded-title-{paycheck.id}"
													name="title"
													required
													placeholder="e.g. Federal tax"
												/>
											</div>
											<div class="field">
												<label class="field__label" for="ded-kind-{paycheck.id}">Type</label>
												<select
													class="field__input"
													id="ded-kind-{paycheck.id}"
													name="kind"
													bind:value={newDeductionKind}
												>
													<option value="fixed">Fixed ($)</option>
													<option value="percent">Percent (%)</option>
												</select>
											</div>
											{#if newDeductionKind === 'percent'}
												<div class="field">
													<label class="field__label" for="ded-basis-{paycheck.id}">Basis</label>
													<select
														class="field__input"
														id="ded-basis-{paycheck.id}"
														name="basis"
														bind:value={newDeductionBasis}
													>
														<option value="gross">% of gross</option>
														<option value="net">% of net</option>
													</select>
												</div>
											{/if}
											<div class="field">
												<label class="field__label" for="ded-value-{paycheck.id}">
													{newDeductionKind === 'percent' ? 'Percentage' : 'Amount'}
												</label>
												<input
													class="field__input"
													id="ded-value-{paycheck.id}"
													name="value"
													required
													placeholder={newDeductionKind === 'percent' ? 'e.g. 6.5' : 'e.g. 250.00'}
												/>
											</div>
											<button class="button" type="submit">Add deduction</button>
										</form>
										{#if newDeductionKind === 'percent' && newDeductionBasis === 'net'}
											<p class="hint">Net % applies after fixed and gross-% deductions.</p>
										{/if}
									</section>

									<section class="detail__section">
										<h3 class="detail__title">Fund allocations</h3>

										{#if data.funds.length === 0}
											<p class="detail__empty">No funds yet — add them on the Funds page.</p>
										{:else}
											{#if paycheck.allocations.length === 0}
												<p class="detail__empty">
													Nothing funneled into funds from this paycheck yet.
												</p>
											{:else}
												<table class="table detail__list">
													<tbody>
														{#each paycheck.allocations as allocation (allocation.id)}
															{#if editingAllocationId === allocation.id}
																<tr>
																	<td colspan="5">
																		<form
																			class="rule-form"
																			method="POST"
																			action="?/updateAllocation"
																			use:enhance={() =>
																				({ update }) => {
																					editingAllocationId = null;
																					update();
																				}}
																		>
																			<input type="hidden" name="id" value={allocation.id} />
																			<div class="field">
																				<label
																					class="field__label"
																					for="alloc-edit-fund-{allocation.id}"
																				>
																					Fund
																				</label>
																				<select
																					class="field__input"
																					id="alloc-edit-fund-{allocation.id}"
																					name="fundId"
																				>
																					{#each data.funds as fund}
																						<option
																							value={fund.id}
																							selected={fund.id === allocation.fundId}
																						>
																							{fund.name}
																						</option>
																					{/each}
																				</select>
																			</div>
																			<div class="field">
																				<label
																					class="field__label"
																					for="alloc-edit-kind-{allocation.id}"
																				>
																					Type
																				</label>
																				<select
																					class="field__input"
																					id="alloc-edit-kind-{allocation.id}"
																					name="kind"
																					bind:value={editAllocationKind}
																				>
																					<option value="fixed">Fixed ($)</option>
																					<option value="percent">Percent (%)</option>
																				</select>
																			</div>
																			{#if editAllocationKind === 'percent'}
																				<div class="field">
																					<label
																						class="field__label"
																						for="alloc-edit-basis-{allocation.id}"
																					>
																						Basis
																					</label>
																					<select
																						class="field__input"
																						id="alloc-edit-basis-{allocation.id}"
																						name="basis"
																						bind:value={editAllocationBasis}
																					>
																						<option value="gross">% of gross</option>
																						<option value="net">% of net</option>
																					</select>
																				</div>
																			{/if}
																			<div class="field">
																				<label
																					class="field__label"
																					for="alloc-edit-value-{allocation.id}"
																				>
																					{editAllocationKind === 'percent' ? 'Percentage' : 'Amount'}
																				</label>
																				<input
																					class="field__input"
																					id="alloc-edit-value-{allocation.id}"
																					name="value"
																					required
																					value={allocation.kind === 'percent'
																						? allocation.value / 100
																						: dollars(allocation.value)}
																				/>
																			</div>
																			<button class="button" type="submit">Save</button>
																			<button
																				class="link-action"
																				type="button"
																				onclick={() => (editingAllocationId = null)}
																			>
																				Cancel
																			</button>
																		</form>
																	</td>
																</tr>
															{:else}
																<tr>
																	<td>{allocation.fund.name}</td>
																	<td><span class="badge">{ruleLabel(allocation)}</span></td>
																	<td class="table__cell--number">
																		{formatCents(allocation.resolvedCents)}
																	</td>
																	<td class="table__cell--number">
																		<div class="inline-form">
																			<button
																				class="link-action"
																				type="button"
																				onclick={() => startEditAllocation(allocation)}
																			>
																				Edit
																			</button>
																			<form method="POST" action="?/deleteAllocation" use:enhance>
																				<input type="hidden" name="id" value={allocation.id} />
																				<button class="link-action" type="submit">
																					Remove
																				</button>
																			</form>
																		</div>
																	</td>
																</tr>
															{/if}
														{/each}
													</tbody>
												</table>
											{/if}

											<form class="rule-form" method="POST" action="?/createAllocation" use:enhance>
												<input type="hidden" name="paycheckId" value={paycheck.id} />
												<div class="field">
													<label class="field__label" for="alloc-fund-{paycheck.id}">Fund</label>
													<select class="field__input" id="alloc-fund-{paycheck.id}" name="fundId">
														{#each data.funds as fund}
															<option value={fund.id}>{fund.name}</option>
														{/each}
													</select>
												</div>
												<div class="field">
													<label class="field__label" for="alloc-kind-{paycheck.id}">Type</label>
													<select
														class="field__input"
														id="alloc-kind-{paycheck.id}"
														name="kind"
														bind:value={newAllocationKind}
													>
														<option value="fixed">Fixed ($)</option>
														<option value="percent">Percent (%)</option>
													</select>
												</div>
												{#if newAllocationKind === 'percent'}
													<div class="field">
														<label class="field__label" for="alloc-basis-{paycheck.id}">Basis</label>
														<select
															class="field__input"
															id="alloc-basis-{paycheck.id}"
															name="basis"
															bind:value={newAllocationBasis}
														>
															<option value="net">% of net</option>
															<option value="gross">% of gross</option>
														</select>
													</div>
												{/if}
												<div class="field">
													<label class="field__label" for="alloc-value-{paycheck.id}">
														{newAllocationKind === 'percent' ? 'Percentage' : 'Amount'}
													</label>
													<input
														class="field__input"
														id="alloc-value-{paycheck.id}"
														name="value"
														required
														placeholder={newAllocationKind === 'percent' ? 'e.g. 10' : 'e.g. 500.00'}
													/>
												</div>
												<button class="button" type="submit">Add allocation</button>
											</form>

											<p class="hint">
												{formatCents(netCents(paycheck) - allocatedCents(paycheck))} of net remains
												unallocated.
											</p>
										{/if}
									</section>
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
	
	.paycheck-form__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-4);

		.field {
			margin-bottom: 0;
		}
	}

	textarea.field__input {
		resize: vertical;
		min-height: 3rem;
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
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);

		&__section {
			margin: 0;
		}

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
			border-radius: var(--radius-md);
		}
	}

	.badge {
		display: inline-block;
		padding: 0.1rem var(--space-2);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		border: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.rule-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;

		.field {
			flex: 1;
			min-width: 130px;
			margin-bottom: 0;
		}
	}

	.hint {
		margin: var(--space-2) 0 0;
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
</style>
