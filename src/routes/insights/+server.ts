import { json } from '@sveltejs/kit';
import { buildDigest, digestToPrompt } from '$lib/server/insights/digest';
import { buildRawDataset, rawToPrompt } from '$lib/server/insights/raw';
import { SYSTEM_PROMPT, RAW_SYSTEM_PROMPT, isAvailable, streamChat, MODEL } from '$lib/server/insights/ollama';
import type { RequestHandler } from './$types';

/**
 * Generates spending insights with a local LLM over *all* recorded data.
 *
 * Two modes (via `?mode=`):
 *   summary (default) — the model interprets an exact, server-computed digest.
 *   raw               — the model reads the individual transactions and finds
 *                       patterns itself.
 *
 * The response is streamed back as plain text (token-by-token). If the local
 * Ollama server isn't reachable, responds 503 with a hint the page renders as
 * setup instructions.
 */
export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('mode') === 'raw' ? 'raw' : 'summary';

	if (!(await isAvailable())) {
		return json(
			{
				error: 'ollama-unavailable',
				hint: `Couldn't reach a local Ollama server. Install Ollama, run \`ollama pull ${MODEL}\`, and make sure it's running.`
			},
			{ status: 503 }
		);
	}

	let system: string;
	let prompt: string;

	if (mode === 'raw') {
		const dataset = await buildRawDataset();
		if (dataset.rows.length === 0) {
			return json(
				{ error: 'no-data', hint: 'No expenses recorded yet. Add some and try again.' },
				{ status: 422 }
			);
		}
		system = RAW_SYSTEM_PROMPT;
		prompt = rawToPrompt(dataset);
	} else {
		const digest = await buildDigest();
		if (!digest.hasData) {
			return json(
				{ error: 'no-data', hint: 'No income or expenses recorded yet. Add some and try again.' },
				{ status: 422 }
			);
		}
		system = SYSTEM_PROMPT;
		prompt = digestToPrompt(digest);
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				for await (const chunk of streamChat(system, prompt)) {
					controller.enqueue(encoder.encode(chunk));
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Analysis failed';
				controller.enqueue(encoder.encode(`\n\n_Error: ${message}_`));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
};
