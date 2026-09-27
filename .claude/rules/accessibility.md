---
paths:
  - "src/**/*.svelte"
---
# Accessibility patterns for this app's components

- Dialogs: `Modal.svelte` opens the native `<dialog>` with `showModal()`, which makes the page
  behind inert and closes on Escape. Put `autofocus` on the first field (or on the close button
  when nothing needs input first); never put `tabindex` on the `<dialog>`.
  Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog (checked 2026-09-26)
- A dialog is labelled from its visible title (`aria-labelledby`), and on close focus returns to
  the control that opened it. Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (checked 2026-09-26)
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
