---
paths:
  - "src/**/*.svelte"
---
# Accessibility patterns for this app's components

- Dialogs: `Modal.svelte` opens the native `<dialog>` with `showModal()`, which makes the page
  behind inert and closes on Escape. Put `autofocus` on the first field, directly after
  `<!-- svelte-ignore a11y_autofocus -- Modal's <dialog> focuses this field when it opens -->`
  (Svelte only exempts a `<dialog>`'s own children); with nothing to fill in, leave it off and
  focus starts on Close. Never put `tabindex` on the `<dialog>`.
  Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog (checked 2026-09-26)
- Modal renders its content only while open: after navigation and enhanced form submits SvelteKit
  focuses any `[autofocus]` on the page instead of `<body>`, so a field in a closed dialog would
  take it. Source: https://svelte.dev/docs/kit/accessibility (checked 2026-09-27)
- A dialog is labelled from its visible title (`aria-labelledby`). When focus skips a sentence
  that explains it (a summary above the first field, a delete prompt), pass that element's id as
  `descriptionId` (`aria-describedby`). On close focus returns to the control that opened it, or
  to `<main>` when that control is gone (a deleted row, an empty state that filled).
  Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (checked 2026-09-27)
- Listboxes (`PeriodFilter.svelte`): `role="listbox"` with a name, `role="option"` children with
  `aria-selected`, arrow keys plus Home and End. Options never hold buttons, links or checkboxes: a
  list of checkboxes is a labelled group, as in `MultiSelect.svelte`.
  Source: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ (checked 2026-09-26)
- Sortable tables (`SortableHeader.svelte`): `aria-sort` on the one sorted `<th>` only, the header
  text inside a `<button>`, the arrow `aria-hidden`.
  Source: https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/ (checked 2026-09-26)
- A value inside a known range (a budget used, a goal reached) is `role="meter"`;
  `role="progressbar"` (`ProgressBar.svelte`) is for task progress such as the CSV import. Add
  `aria-valuetext` when a bare percentage says too little.
  Source: https://www.w3.org/WAI/ARIA/apg/patterns/meter/ (checked 2026-09-26)
