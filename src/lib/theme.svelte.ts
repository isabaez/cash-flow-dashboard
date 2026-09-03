/**
 * Theme preference — light / dark / system.
 *
 * `preference` is what the user chose; `resolved` is what is actually on screen.
 * They differ only for "system", which stores nothing and defers to the
 * `prefers-color-scheme` media query in `_tokens.scss`. Keeping the two separate is
 * what lets the toggle show "System" as a real, selectable state rather than
 * silently freezing whatever the OS happened to be at first visit.
 *
 * The first paint is handled by the inline script in `app.html`; this module takes
 * over once Svelte hydrates.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readStored(): ThemePreference {
	if (typeof localStorage === 'undefined') return 'system';
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === 'light' || value === 'dark' ? value : 'system';
	} catch {
		// Private mode or blocked storage — behave as "system".
		return 'system';
	}
}

let preference = $state<ThemePreference>('system');
let systemPrefersDark = $state(true);

function apply(next: ThemePreference) {
	if (typeof document === 'undefined') return;
	// "system" removes the attribute so the media query decides; anything else pins it.
	if (next === 'system') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = next;
}

export const theme = {
	get preference(): ThemePreference {
		return preference;
	},

	/** What is actually rendered right now — the value charts should key off. */
	get resolved(): ResolvedTheme {
		if (preference !== 'system') return preference;
		return systemPrefersDark ? 'dark' : 'light';
	},

	set(next: ThemePreference) {
		preference = next;
		apply(next);
		try {
			if (next === 'system') localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Not persisting is survivable; the in-memory choice still applies.
		}
	},

	/**
	 * Sync from storage and track the OS setting. Call once from the root layout;
	 * returns a teardown for the media-query listener.
	 */
	init(): () => void {
		preference = readStored();
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		systemPrefersDark = query.matches;
		const onChange = (event: MediaQueryListEvent) => (systemPrefersDark = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}
};
