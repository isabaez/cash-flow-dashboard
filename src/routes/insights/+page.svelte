<script lang="ts">
	// AI insights — asks a local LLM (via Ollama) to analyze all recorded spending.
	// Two passes: a "summary" pass over server-computed totals, and a "raw" pass where
	// the model reads individual transactions and finds patterns itself. All inference
	// is loopback to Ollama; no financial data leaves the machine.

	type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error';
	type Section = { status: Status; output: string; errorHint: string };
	type Mode = 'summary' | 'raw';

	const summary = $state<Section>({ status: 'idle', output: '', errorHint: '' });
	const raw = $state<Section>({ status: 'idle', output: '', errorHint: '' });

	async function analyze(mode: Mode, section: Section) {
		section.status = 'loading';
		section.output = '';
		section.errorHint = '';

		let res: Response;
		try {
			res = await fetch(`/insights?mode=${mode}`);
		} catch {
			section.status = 'error';
			section.errorHint = 'Could not reach the server.';
			return;
		}

		if (!res.ok) {
			// 503 (Ollama down) / 422 (no data) come back as JSON with a hint.
			const body = await res.json().catch(() => null);
			section.status = 'error';
			section.errorHint = body?.hint ?? `Request failed (${res.status}).`;
			return;
		}

		if (!res.body) {
			section.status = 'error';
			section.errorHint = 'No response stream.';
			return;
		}

		section.status = 'streaming';
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			section.output += decoder.decode(value, { stream: true });
		}
		section.status = 'done';
	}

	const isBusy = (s: Section) => s.status === 'loading' || s.status === 'streaming';

	/** Split a line into plain / **bold** segments (no raw HTML — safe by construction). */
	function segments(line: string): { text: string; bold: boolean }[] {
		return line.split(/(\*\*[^*]+\*\*)/g).flatMap((part) => {
			if (!part) return [];
			const bold = part.startsWith('**') && part.endsWith('**');
			return [{ text: bold ? part.slice(2, -2) : part, bold }];
		});
	}

	/** Group streamed markdown into bullet items and loose paragraph lines. */
	function toBlocks(output: string) {
		return output
			.split('\n')
			.map((rawLine) => rawLine.trim())
			.filter(Boolean)
			.map((line) => {
				const bullet = /^[-*]\s+/.test(line);
				return { bullet, segments: segments(bullet ? line.replace(/^[-*]\s+/, '') : line) };
			});
	}
</script>

<svelte:head>
	<title>Insights · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<h1>Insights</h1>
</div>

<p class="insights-intro">
	Analyze all of your recorded income and expenses using a local AI model. Everything runs on your
	Mac — no data leaves your machine.
</p>

{#snippet analysisCard(
	title: string,
	blurb: string,
	buttonLabel: string,
	mode: Mode,
	section: Section
)}
	<div class="card insights">
		<h2 class="insights__title">{title}</h2>
		<p class="insights__blurb">{blurb}</p>

		<button
			class="button"
			type="button"
			onclick={() => analyze(mode, section)}
			disabled={isBusy(section)}
		>
			{isBusy(section) ? 'Analyzing…' : buttonLabel}
		</button>

		{#if section.status === 'loading'}
			<p class="insights__status" role="status">Preparing the data and starting the model…</p>
		{/if}

		{#if section.status === 'error'}
			<div class="insights__error" role="alert"><p>{section.errorHint}</p></div>
		{/if}

		{#if section.output}
			<!-- The model streams token by token. `polite` + `aria-busy` means a screen
			     reader waits for a pause rather than re-reading on every chunk, and the
			     analysis is announced once it settles. -->
			<div
				class="insights__output"
				aria-live="polite"
				aria-atomic="false"
				aria-busy={section.status === 'streaming'}
			>
				<ul class="insights__list">
					{#each toBlocks(section.output) as block}
						{#if block.bullet}
							<li>
								{#each block.segments as seg}{#if seg.bold}<strong>{seg.text}</strong
										>{:else}{seg.text}{/if}{/each}
							</li>
						{:else}
							<p class="insights__para">
								{#each block.segments as seg}{#if seg.bold}<strong>{seg.text}</strong
									>{:else}{seg.text}{/if}{/each}
							</p>
						{/if}
					{/each}
				</ul>
				{#if section.status === 'streaming'}<span class="insights__cursor" aria-hidden="true"
					></span>{/if}
			</div>
		{/if}
	</div>
{/snippet}

<div class="insights-stack">
	{@render analysisCard(
		'Summary insights',
		'Interprets pre-computed totals and trends — monthly net income, expenses, savings rate, category breakdown, and month-over-month changes. Figures are exact.',
		'Analyze my spending',
		'summary',
		summary
	)}

	{@render analysisCard(
		'Raw transaction analysis',
		'The model reads your individual transactions directly and looks for patterns a summary would miss — recurring charges, frequent small purchases, and outliers.',
		'Analyze transactions',
		'raw',
		raw
	)}
</div>

<style lang="scss">
	
	.insights-intro {
		margin: 0 0 var(--space-5);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		max-width: 70ch;
	}

	.insights-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.insights {
		&__title {
			font-size: var(--text-lg);
			margin: 0 0 var(--space-1);
		}

		&__blurb {
			margin: 0 0 var(--space-4);
			color: var(--text-secondary);
			font-size: var(--text-sm);
			max-width: 70ch;
		}

		&__status {
			margin: var(--space-5) 0 0;
			color: var(--text-secondary);
			font-size: var(--text-sm);
		}

		&__error {
			margin-top: var(--space-5);
			padding: var(--space-3) var(--space-4);
			border: 1px solid color-mix(in oklab, var(--neg) 40%, transparent);
			border-left: 3px solid var(--neg);
			border-radius: var(--radius-md);
			background: var(--neg-soft);
			color: var(--text-primary);
			font-size: var(--text-sm);

			p {
				margin: 0;
			}
		}

		&__output {
			margin-top: var(--space-5);
			padding-top: var(--space-5);
			border-top: 1px solid var(--border-subtle);
		}

		&__list {
			margin: 0;
			padding-left: var(--space-5);
			display: flex;
			flex-direction: column;
			gap: var(--space-2);

			li {
				line-height: 1.5;
			}
		}

		&__para {
			list-style: none;
			margin: 0;
			margin-left: calc(-1 * var(--space-5));
			color: var(--text-secondary);
		}

		// The global prefers-reduced-motion rule stops this blinking.
		&__cursor {
			display: inline-block;
			width: 8px;
			height: 1em;
			margin-left: 2px;
			vertical-align: text-bottom;
			background: var(--accent);
			animation: blink 1s steps(2) infinite;
		}
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		50.01%,
		100% {
			opacity: 0;
		}
	}
</style>
