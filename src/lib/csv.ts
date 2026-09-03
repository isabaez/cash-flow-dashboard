/**
 * Minimal RFC-4180-style CSV parsing for the expense importer.
 *
 * Quoting support is essential: a Categories cell like `"Groceries, Dining"`
 * contains commas that must NOT be read as column separators. Handles quoted
 * fields, escaped quotes (`""`), commas/newlines inside quotes, and CRLF.
 */

/** Parse CSV text into a grid of string cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		// Skip rows that are entirely empty (e.g. a trailing newline).
		if (!(row.length === 1 && row[0] === '')) rows.push(row);
		row = [];
	};

	while (i < text.length) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					// Escaped quote inside a quoted field.
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += char;
			i++;
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (char === ',') {
			pushField();
			i++;
			continue;
		}
		if (char === '\r') {
			// Handle CRLF and lone CR as a single row break.
			pushRow();
			if (text[i + 1] === '\n') i++;
			i++;
			continue;
		}
		if (char === '\n') {
			pushRow();
			i++;
			continue;
		}
		field += char;
		i++;
	}

	// Flush the final field/row if the file didn't end with a newline.
	if (field !== '' || row.length > 0) pushRow();

	return rows;
}

/** A CSV data row mapped to expense fields, tagged with its source line number. */
export type CsvExpenseRow = {
	/** 1-based line number in the original file, for error reporting. */
	line: number;
	date: string;
	title: string;
	amount: string;
	categories: string;
};

const HEADER = ['date', 'title', 'amount', 'categories'];

/** True when a parsed row looks like the expected header (case-insensitive). */
function isHeaderRow(cells: string[]): boolean {
	return HEADER.every((name, i) => (cells[i] ?? '').trim().toLowerCase() === name);
}

/**
 * Map parsed CSV rows to expense rows, skipping a leading header row when
 * present. Each row keeps its original 1-based file line number so failures
 * can point the user at the exact line.
 */
export function toExpenseRows(grid: string[][]): CsvExpenseRow[] {
	const out: CsvExpenseRow[] = [];
	const startsWithHeader = grid.length > 0 && isHeaderRow(grid[0]);

	grid.forEach((cells, index) => {
		if (index === 0 && startsWithHeader) return;
		out.push({
			line: index + 1,
			date: (cells[0] ?? '').trim(),
			title: (cells[1] ?? '').trim(),
			amount: (cells[2] ?? '').trim(),
			categories: (cells[3] ?? '').trim()
		});
	});

	return out;
}
