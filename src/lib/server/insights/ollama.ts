import { env } from '$env/dynamic/private';

/**
 * Thin client for a local Ollama server (runs on Apple Silicon, GPU-accelerated
 * via Metal). No npm dependency — just Node's global fetch over loopback, so no
 * financial data ever leaves the machine.
 *
 * Config via env:
 *   OLLAMA_URL   — base URL of the Ollama server (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL — model tag to use   (default llama3.1)
 */

const BASE_URL = (env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
export const MODEL = env.OLLAMA_MODEL ?? 'llama3.1';

/**
 * System prompt: a concise budgeting assistant that must reason only from the
 * digest it's given, never invents figures, and stays in the lane of general
 * budgeting observations — not personalized investment or trading advice.
 */
export const SYSTEM_PROMPT = `You are a concise personal-finance assistant embedded in a cash-flow dashboard.

You will be given a "spending digest": a set of exact, already-computed figures about the user's income and expenses. Your job is to interpret it into clear, useful observations.

Rules:
- Use ONLY the numbers in the digest. Never invent, estimate, or extrapolate figures that aren't there. Do no arithmetic beyond restating what's given.
- Produce 3 to 6 short findings as a markdown bullet list. Each bullet is one or two sentences: a concrete observation (cite the relevant dollar figure or percentage) plus, where useful, a practical budgeting suggestion.
- Focus on trends, notable category spending, month-over-month changes, savings rate, and outsized individual expenses.
- Treat the most recent month as partial — don't call a partial month a "drop" or "decline".
- Be plain and specific. No preamble, no headings, no closing summary — just the bullet list.
- You are not a licensed financial advisor. Keep to general budgeting observations; do not give personalized investment, tax, or trading advice.`;

/**
 * System prompt for the raw-transaction pass: the model receives every individual
 * expense row and looks for patterns itself, rather than reading pre-computed totals.
 */
export const RAW_SYSTEM_PROMPT = `You are a concise personal-finance assistant embedded in a cash-flow dashboard.

You will be given a list of the user's individual expense transactions (date, amount, title, categories, notes). Examine the raw transactions directly and surface patterns a totals summary would miss.

Rules:
- Look for: recurring or subscription-like charges (same merchant/amount repeating), frequent small purchases that add up, notable one-off outliers, duplicated or possibly-mistaken charges, day-of-week or end-of-month clustering, and categories that look under- or over-used.
- Every specific amount you mention must be copied verbatim from a transaction line. Do NOT compute sums, averages, or totals — describe patterns qualitatively (e.g. "appears every month", "several times a week") and leave exact totals to the summary view.
- Produce 3 to 6 short findings as a markdown bullet list. Each bullet: one concrete pattern you noticed, plus a practical budgeting suggestion where it helps.
- Be plain and specific, and name the merchants/titles involved. No preamble, no headings, no closing summary — just the bullet list.
- You are not a licensed financial advisor. Keep to general budgeting observations; no personalized investment, tax, or trading advice.`;

/** Whether a local Ollama server is reachable. Short timeout so the UI stays snappy. */
export async function isAvailable(): Promise<boolean> {
	try {
		const res = await fetch(`${BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(2000)
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Stream a chat completion from Ollama, yielding text chunks as they arrive.
 * Ollama returns newline-delimited JSON objects; each carries a `message.content`
 * fragment and a final `{ done: true }`.
 */
export async function* streamChat(system: string, user: string): AsyncGenerator<string> {
	const res = await fetch(`${BASE_URL}/api/chat`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			stream: true,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			]
		})
	});

	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Ollama request failed (${res.status}): ${detail || res.statusText}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		// Emit each complete line; keep any trailing partial line in the buffer.
		let newline: number;
		while ((newline = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			try {
				const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
				const content = obj.message?.content;
				if (content) yield content;
			} catch {
				// Ignore malformed lines rather than aborting the stream.
			}
		}
	}
}
