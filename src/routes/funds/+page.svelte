<script lang="ts">
	import { formatCents, formatBps } from '$lib/money';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>Funds</h1>

<div class="card">
	{#if data.funds.length === 0}
		<p class="empty-state">
			No funds yet. Create funds like Savings, Utilities, or Discretionary, then funnel income
			into them from the Income page. (Forms are the next build step — see README roadmap.)
		</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th>Fund</th>
					<th>Savings?</th>
					<th>Funded by</th>
				</tr>
			</thead>
			<tbody>
				{#each data.funds as fund (fund.id)}
					<tr>
						<td>{fund.name}</td>
						<td>{fund.isSavings ? 'Yes' : 'No'}</td>
						<td>
							{#each fund.allocations as a, i}
								{i > 0 ? ', ' : ''}{a.incomeStream.title}
								({a.kind === 'percent' ? formatBps(a.value) : formatCents(a.value)})
							{:else}
								—
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
