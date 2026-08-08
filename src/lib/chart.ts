import type { Chart, LegendItem } from 'chart.js';

/** $color-text — legend label text. Set per item since a custom generateLabels
 * bypasses the labels.color default. */
const TEXT_COLOR = '#e7eaf0';

/**
 * Shared Chart.js legend styling. Keys sit *below* the chart as small, uniform
 * squares, each a single flat color (the series/slice color) rather than
 * Chart.js's default fill-plus-border marker. `generateLabels` is overridden so
 * the swatch is one solid color; `datasetIndex` / `index` are preserved so the
 * default click-to-toggle behaviour still works.
 */
const KEY_LABELS = {
	boxWidth: 11,
	boxHeight: 11,
	padding: 16,
	usePointStyle: false,
	color: TEXT_COLOR
} as const;

/** For bar/line charts, where each legend key maps to a dataset. Datasets flagged
 * `hideInLegend` are skipped — e.g. per-series projection lines that share a color
 * with (and are already represented by) their actual-data counterpart. */
export const seriesLegend = {
	position: 'bottom' as const,
	labels: {
		...KEY_LABELS,
		generateLabels: (chart: Chart): LegendItem[] =>
			chart.data.datasets.flatMap((ds, i) => {
				if ((ds as { hideInLegend?: boolean }).hideInLegend) return [];
				const color = (ds.borderColor ?? ds.backgroundColor) as string;
				return [
					{
						text: (ds.label ?? '') as string,
						fillStyle: color,
						strokeStyle: color,
						fontColor: TEXT_COLOR,
						lineWidth: 0,
						hidden: !chart.isDatasetVisible(i),
						datasetIndex: i
					}
				];
			})
	}
};

/** For the doughnut, where each legend key maps to a slice (data index). */
export const categoryLegend = {
	position: 'bottom' as const,
	labels: {
		...KEY_LABELS,
		generateLabels: (chart: Chart): LegendItem[] => {
			const colors = (chart.data.datasets[0]?.backgroundColor ?? []) as string[];
			return (chart.data.labels ?? []).map((label, i) => ({
				text: String(label),
				fillStyle: colors[i],
				strokeStyle: colors[i],
				fontColor: TEXT_COLOR,
				lineWidth: 0,
				hidden: !chart.getDataVisibility(i),
				index: i
			}));
		}
	}
};
