---
paths:
  - "src/routes/**"
  - "src/lib/server/**"
---
# SvelteKit

- Every write is a form action in `+page.server.ts` behind `method="POST"`; a `GET` form only
  navigates, as the URL filters do. Source: https://svelte.dev/docs/kit/form-actions (checked 2026-09-26)
- Invalid input returns `fail(400, { … })`, which re-renders the page with that data in `form`;
  a redirect after a POST is `redirect(303, …)`.
  Source: https://svelte.dev/docs/kit/form-actions (checked 2026-09-26)
- Forms use `use:enhance`. A form that needs custom handling passes a submit function and calls
  `update()` to keep the default reset and invalidation.
  Source: https://svelte.dev/docs/kit/form-actions (checked 2026-09-26)
- Server-only code lives in `$lib/server/` and private env comes from `$env/dynamic/private` (as in
  `src/lib/server/insights/ollama.ts`); the build stops on client code that imports either, even
  indirectly. Source: https://svelte.dev/docs/kit/server-only-modules (checked 2026-09-26)
- Code shared across routes goes in `$lib`, not in a route file.
  Source: https://svelte.dev/docs/kit/routing (checked 2026-09-26)
