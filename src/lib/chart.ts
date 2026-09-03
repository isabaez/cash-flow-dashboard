import type { Chart, LegendItem, PointStyle } from 'chart.js';

/**
 * Chart.js styling driven by the design tokens rather than literal hex.
 *
 * Chart.js draws to a canvas, so it cannot inherit CSS. These helpers read the
 * resolved custom properties off `<html>` and hand them over as plain strings —
 * which is what lets a theme switch restyle every chart without a second palette
 * being maintained here.
 */

export interface ChartTokens {
	text: string;
	muted: string;
	grid: string;
	surface: string;
	series: string[];
}

/** Fallback used during SSR, where there is no computed style to read. */
const SSR_TOKENS: ChartTokens = {
	text: '#e7eaf0',
	muted: '#97a0b3',
	grid: '#232b38',
	surface: '#12161f',
	series: []
};

/** Read the current theme's chart colours out of the CSS custom properties. */
export function readChartTokens(): ChartTokens {
	if (typeof document === 'undefined') return SSR_TOKENS;
	const style = getComputedStyle(document.documentElement);
	const read = (name: string) => style.getPropertyValue(name).trim();
	return {
		text: read('--text-primary'),
		muted: read('--text-secondary'),
		grid: read('--border-subtle'),
		surface: read('--surface-1'),
		series: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`))
	};
}

/** Nth categorical series colour, wrapping past the end of the palette. */
export function seriesColor(tokens: ChartTokens, index: number): string {
	return tokens.series[index % tokens.series.length] || tokens.text;
}

/**
 * Point markers, cycled alongside the palette. Colour alone must not be what
 * distinguishes one line from another (WCAG 2.2 SC 1.4.1), and marker shape
 * survives both greyscale printing and every form of colour-vision deficiency.
 */
export const POINT_STYLES = [
	'circle', 'rect', 'triangle', 'rectRot', 'star',
	'cross', 'rectRounded', 'crossRot', 'line', 'dash'
] as const;

export const pointStyle = (index: number): PointStyle =>
	POINT_STYLES[index % POINT_STYLES.length] as PointStyle;

/**
 * Shared legend styling. Keys sit below the chart as small uniform swatches, each
 * a single flat colour. `generateLabels` is overridden so the swatch is one solid
 * colour; `datasetIndex` is preserved so click-to-toggle still works. Datasets
 * flagged `hideInLegend` are skipped — e.g. per-series projection lines that share
 * a colour with the actual-data series they extend.
 */
export function seriesLegend(tokens: ChartTokens) {
	return {
		position: 'bottom' as const,
		labels: {
			boxWidth: 11,
			boxHeight: 11,
			padding: 16,
			usePointStyle: true,
			color: tokens.text,
			generateLabels: (chart: Chart): LegendItem[] =>
				chart.data.datasets.flatMap((ds, i) => {
					if ((ds as { hideInLegend?: boolean }).hideInLegend) return [];
					const color = (ds.borderColor ?? ds.backgroundColor) as string;
					return [
						{
							text: (ds.label ?? '') as string,
							fillStyle: color,
							strokeStyle: color,
							fontColor: tokens.text,
							lineWidth: 0,
							pointStyle: ((ds as { pointStyle?: PointStyle }).pointStyle ?? 'circle') as PointStyle,
							hidden: !chart.isDatasetVisible(i),
							datasetIndex: i
						}
					];
				})
		}
	};
}
