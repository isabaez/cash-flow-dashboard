<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/Modal.svelte';
	import { formatCents, formatBps } from '$lib/money';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Stream = (typeof data.streams)[number];

	// Whether the "add income stream" modal is open.
	let showAddModal = $state(false);
	// Which stream's deductions panel is expanded.
	let expandedId = $state<number | null>(null);
	// Which stream is being edited inline.
	let editingId = $state<number | null>(null);
	// Which stream is pending delete confirmation.
	let deletingId = $state<number | null>(null);
	// Kind of the deduction currently being added (drives the value input hint).
	let newDeductionKind = $state<'fixed' | 'percent'>('fixed');
	// Which deduction is being edited inline, and the kind of its edit form.
	let editingDeductionId = $state<number | null>(null);
	let editDeductionKind = $state<'fixed' | 'percent'>('fixed');

	function startEditDeduction(id: number, kind: string) {
		editingDeductionId = id;
		editDeductionKind = kind === 'percent' ? 'percent' : 'fixed';
	}

	const OWNERS = ['joint', 'me', 'spouse'];

	function toggleExpanded(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	/** Net = gross minus fixed deductions minus percent deductions of gross. */
	function netCents(stream: Stream): number {
		return stream.deductions.reduce(
			(net, d) =>
				net - (d.kind === 'percent' ? Math.round((stream.amountCents * d.value) / 10000) : d.value),
			stream.amountCents
		);
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}
</script>

<div class="page-header">
	<h1>Income</h1>
	<button class="button" type="button" onclick={() => (showAddModal = true)}>Add income stream</button>
</div>

{#if form?.error}
	<p class="form-error">{form.error}</p>
{/if}

<Modal bind:open={showAddModal} title="New income stream">
	{#if form?.error}
		<p class="form-error">{form.error}</p>
	{/if}
	<form
		class="stream-form"
		method="POST"
		action="?/createStream"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') showAddModal = false;
			}}
	>
		<div class="field">
			<label class="field__label" for="title">Income stream</label>
			<input class="field__input" id="title" name="title" required placeholder="e.g. Salary" />
		</div>
		<div class="field">
			<label class="field__label" for="amount">Gross amount</label>
			<input class="field__input" id="amount" name="amount" required placeholder="e.g. 5,000.00" />
		</div>
		<div class="field">
			<label class="field__label" for="owner">Owner</label>
			<select class="field__input" id="owner" name="owner">
				{#each OWNERS as owner}
					<option value={owner}>{owner}</option>
				{/each}
			</select>
		</div>
		<button class="button" type="submit">Add</button>
	</form>
</Modal>

<div class="card">
	{#if data.streams.length === 0}
		<p class="empty-state">No income streams yet.</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th class="table__cell--caret"></th>
					<th>Stream</th>
					<th>Owner</th>
					<th class="table__cell--number">Gross</th>
					<th class="table__cell--number">Deductions</th>
					<th class="table__cell--number">Net</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.streams as stream (stream.id)}
					{#if editingId === stream.id}
						<tr>
							<td colspan="7">
								<form
									class="stream-form"
									method="POST"
									action="?/updateStream"
									use:enhance={() =>
										({ update }) => {
											editingId = null;
											update();
										}}
								>
									<input type="hidden" name="id" value={stream.id} />
									<div class="field">
										<label class="field__label" for="edit-title-{stream.id}">Income stream</label>
										<input
											class="field__input"
											id="edit-title-{stream.id}"
											name="title"
											required
											value={stream.title}
										/>
									</div>
									<div class="field">
										<label class="field__label" for="edit-amount-{stream.id}">Gross amount</label>
										<input
											class="field__input"
											id="edit-amount-{stream.id}"
											name="amount"
											required
											value={dollars(stream.amountCents)}
										/>
									</div>
									<div class="field">
										<label class="field__label" for="edit-owner-{stream.id}">Owner</label>
										<select class="field__input" id="edit-owner-{stream.id}" name="owner">
											{#each OWNERS as owner}
												<option value={owner} selected={owner === stream.owner}>{owner}</option>
											{/each}
										</select>
									</div>
									<button class="button" type="submit">Save</button>
									<button
										class="button button--ghost"
										type="button"
										onclick={() => (editingId = null)}
									>
										Cancel
									</button>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td class="table__cell--caret">
								<button
									class="caret"
									class:caret--open={expandedId === stream.id}
									type="button"
									aria-expanded={expandedId === stream.id}
									aria-label="Toggle deductions for {stream.title}"
									onclick={() => toggleExpanded(stream.id)}
								>
									▸
								</button>
							</td>
							<td>{stream.title}</td>
							<td>{stream.owner}</td>
							<td class="table__cell--number">{formatCents(stream.amountCents)}</td>
							<td class="table__cell--number">{stream.deductions.length}</td>
							<td class="table__cell--number">{formatCents(netCents(stream))}</td>
							<td>
								{#if deletingId === stream.id}
									<form
										class="inline-form"
										method="POST"
										action="?/deleteStream"
										use:enhance={() =>
											({ update }) => {
												deletingId = null;
												update();
											}}
									>
										<input type="hidden" name="id" value={stream.id} />
										<span class="confirm-text">
											Delete{stream.deductions.length > 0
												? ` and its ${stream.deductions.length} deduction${stream.deductions.length > 1 ? 's' : ''}`
												: ''}?
										</span>
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
												editingId = stream.id;
												deletingId = null;
											}}
										>
											Edit
										</button>
										<button
											class="button button--ghost"
											type="button"
											onclick={() => (deletingId = stream.id)}
										>
											Delete
										</button>
									</div>
								{/if}
							</td>
						</tr>
					{/if}

					{#if expandedId === stream.id}
						<tr class="detail-row">
							<td colspan="7">
								<div class="deductions">
									<h3 class="deductions__title">Deductions</h3>

									{#if stream.deductions.length === 0}
										<p class="deductions__empty">No deductions on this stream yet.</p>
									{:else}
										<table class="table deductions__list">
											<tbody>
												{#each stream.deductions as deduction (deduction.id)}
													{#if editingDeductionId === deduction.id}
														<tr>
															<td colspan="4">
																<form
																	class="deduction-form"
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
																		<label class="field__label" for="ded-edit-kind-{deduction.id}">Type</label>
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
																		class="button button--ghost"
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
															<td>
																<span class="badge">{deduction.kind}</span>
															</td>
															<td class="table__cell--number">
																{deduction.kind === 'percent'
																	? formatBps(deduction.value)
																	: formatCents(deduction.value)}
															</td>
															<td class="table__cell--number">
																<div class="inline-form">
																	<button
																		class="button button--ghost"
																		type="button"
																		onclick={() => startEditDeduction(deduction.id, deduction.kind)}
																	>
																		Edit
																	</button>
																	<form method="POST" action="?/deleteDeduction" use:enhance>
																		<input type="hidden" name="id" value={deduction.id} />
																		<button class="button button--ghost" type="submit">Remove</button>
																	</form>
																</div>
															</td>
														</tr>
													{/if}
												{/each}
											</tbody>
										</table>
									{/if}

									<form
										class="deduction-form"
										method="POST"
										action="?/createDeduction"
										use:enhance
									>
										<input type="hidden" name="incomeStreamId" value={stream.id} />
										<div class="field">
											<label class="field__label" for="ded-title-{stream.id}">New deduction</label>
											<input
												class="field__input"
												id="ded-title-{stream.id}"
												name="title"
												required
												placeholder="e.g. Federal tax"
											/>
										</div>
										<div class="field">
											<label class="field__label" for="ded-kind-{stream.id}">Type</label>
											<select
												class="field__input"
												id="ded-kind-{stream.id}"
												name="kind"
												bind:value={newDeductionKind}
											>
												<option value="fixed">Fixed ($)</option>
												<option value="percent">Percent (%)</option>
											</select>
										</div>
										<div class="field">
											<label class="field__label" for="ded-value-{stream.id}">
												{newDeductionKind === 'percent' ? 'Percentage' : 'Amount'}
											</label>
											<input
												class="field__input"
												id="ded-value-{stream.id}"
												name="value"
												required
												placeholder={newDeductionKind === 'percent' ? 'e.g. 6.5' : 'e.g. 250.00'}
											/>
										</div>
										<button class="button" type="submit">Add deduction</button>
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

	.stream-form {
		display: flex;
		align-items: flex-end;
		gap: $space-md;
		flex-wrap: wrap;

		.field {
			flex: 1;
			min-width: 140px;
			margin-bottom: 0;
		}
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

	.deductions {
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
	}

	.badge {
		display: inline-block;
		padding: 0.1rem $space-sm;
		border-radius: $radius;
		background: $color-border;
		color: $color-text-muted;
		font-size: $text-sm;
	}

	.deduction-form {
		display: flex;
		align-items: flex-end;
		gap: $space-md;
		flex-wrap: wrap;

		.field {
			flex: 1;
			min-width: 140px;
			margin-bottom: 0;
		}
	}

	.form-error {
		color: $color-danger;
		font-size: $text-sm;
	}
</style>
