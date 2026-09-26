---
paths:
  - "src/**/*.svelte"
  - "src/**/*.svelte.ts"
---
# Svelte 5

- Runes only: `$props()` for props, `$state` for local state, `onclick={…}` attributes instead of
  `on:click`, snippets and `{@render}` instead of slots, callback props instead of
  `createEventDispatcher`. The code has no Svelte 4 syntax left.
  Source: https://svelte.dev/docs/svelte/v5-migration-guide (checked 2026-09-26)
- Event modifiers (`|preventDefault`) don't exist on attributes: call `event.preventDefault()` in
  the handler. Source: https://svelte.dev/docs/svelte/v5-migration-guide (checked 2026-09-26)
- A value computed from state is `$derived` (`$derived.by` for a block). The expression has no side
  effects and never assigns state. Source: https://svelte.dev/docs/svelte/$derived (checked 2026-09-26)
- `$effect` is for side effects only (a Chart.js instance, DOM APIs, listeners) and returns its
  teardown. Never use it to copy one piece of state into another: derive it.
  Source: https://svelte.dev/docs/svelte/$effect (checked 2026-09-26)
- Effects run only in the browser, and only values read synchronously are tracked: a value read
  after `await` or inside a timer is not a dependency.
  Source: https://svelte.dev/docs/svelte/$effect (checked 2026-09-26)
- An effect that writes state it also reads loops forever; read such a value with `untrack()`.
  Source: https://svelte.dev/docs/svelte/$effect (checked 2026-09-26)
