<script lang="ts">
	import '$lib/styles/global.scss';
	import { page } from '$app/state';
	import { navLinks } from '$lib/nav';
	import { theme } from '$lib/theme.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();

	// Mobile drawer.
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();
	let drawer = $state<HTMLElement>();

	// Desktop sidebar collapsed to an icon rail.
	let collapsed = $state(false);

	function closeMenu(refocus = false) {
		if (!menuOpen) return;
		menuOpen = false;
		if (refocus) menuButton?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeMenu(true);
	}

	// Close the drawer whenever navigation happens.
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});

	// Move focus into the drawer when it opens. `inert` on <main> keeps focus from
	// escaping back out, so no manual tab trap is needed.
	//
	// The rAF matters: this effect runs right after the class that reveals the drawer
	// is applied, but before the browser recomputes style — and focus() is silently
	// ignored on an element that is still `visibility: hidden`. Waiting one frame
	// lets the reveal land first.
	$effect(() => {
		if (!menuOpen) return;
		const frame = requestAnimationFrame(() => {
			// `.nav__link`, not just `a`: the first anchor in the drawer is the brand,
			// which is display:none below the sidebar breakpoint — i.e. exactly where
			// the drawer is used — so focusing it would silently do nothing.
			drawer?.querySelector<HTMLAnchorElement>('.nav__link')?.focus();
		});
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => theme.init());

	$effect(() => {
		try {
			collapsed = localStorage.getItem('sidebar-collapsed') === '1';
		} catch {
			/* storage blocked — stay expanded */
		}
	});

	function toggleCollapsed() {
		collapsed = !collapsed;
		try {
			localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
		} catch {
			/* not persisting is survivable */
		}
	}

	// The drawer only exists below the sidebar breakpoint; if the viewport grows
	// while it is open, drop the open state so <main> does not stay inert.
	$effect(() => {
		const query = window.matchMedia('(min-width: 1024px)');
		const onChange = (e: MediaQueryListEvent) => {
			if (e.matches) menuOpen = false;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<a class="skip-link" href="#main">Skip to content</a>

<div class="app" class:app--collapsed={collapsed}>
	<!-- Mobile only: the sidebar replaces this from 1024px up. -->
	<header class="topbar">
		<a class="brand" href="/">
			<span class="brand__mark" aria-hidden="true"></span>
			<span class="brand__name">Cash Flow</span>
		</a>
		<button
			bind:this={menuButton}
			class="topbar__menu"
			type="button"
			aria-expanded={menuOpen}
			aria-controls="primary-nav"
			aria-label="Menu"
			onclick={() => (menuOpen = !menuOpen)}
		>
			<span class="topbar__icon" class:topbar__icon--open={menuOpen} aria-hidden="true"></span>
		</button>
	</header>

	{#if menuOpen}
		<!-- Presentational: Escape and the in-drawer links already close this, so it
		     must not be focusable or announced. -->
		<div class="scrim" onclick={() => closeMenu(true)} role="presentation"></div>
	{/if}

	<aside
		bind:this={drawer}
		id="primary-nav"
		class="sidebar"
		class:sidebar--open={menuOpen}
		aria-label="Primary"
	>
		<a class="brand brand--sidebar" href="/">
			<span class="brand__mark" aria-hidden="true"></span>
			<span class="brand__name">Cash Flow</span>
		</a>

		<nav class="nav" aria-label="Primary">
			{#each navLinks as link (link.href)}
				<a
					class="nav__link"
					class:nav__link--active={page.url.pathname === link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					href={link.href}
					title={collapsed ? link.label : undefined}
				>
					<svg class="nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d={link.icon}
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<!-- Kept in the DOM when collapsed (clipped, not removed) so screen
					     readers still announce the destination. -->
					<span class="nav__label">{link.label}</span>
				</a>
			{/each}
		</nav>

		<div class="sidebar__footer">
			<ThemeToggle />
			<button
				class="sidebar__collapse"
				type="button"
				aria-expanded={!collapsed}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				onclick={toggleCollapsed}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
					<path
						d="M15 6l-6 6 6 6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</div>
	</aside>

	<main id="main" class="content" inert={menuOpen}>
		{@render children()}
	</main>
</div>

<style lang="scss">
	@use 'breakpoints' as *;

	.app {
		min-height: 100vh;

		@media (min-width: $breakpoint-lg) {
			display: grid;
			grid-template-columns: var(--sidebar-w) minmax(0, 1fr);

			&--collapsed {
				grid-template-columns: var(--sidebar-w-collapsed) minmax(0, 1fr);
			}
		}
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-primary);
		text-decoration: none;
		font-size: var(--text-md);
		font-weight: 650;
		letter-spacing: -0.02em;

		&__mark {
			flex: none;
			inline-size: 22px;
			block-size: 22px;
			border-radius: 7px;
			background: linear-gradient(140deg, var(--accent), var(--chart-5));
		}

		&--sidebar {
			display: none;
			padding: var(--space-5) var(--space-4) var(--space-4);

			@media (min-width: $breakpoint-lg) {
				display: flex;
			}
		}
	}

	// --- Mobile top bar ------------------------------------------------------
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		height: var(--header-h);
		padding: 0 var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--border-subtle);

		@media (min-width: $breakpoint-lg) {
			display: none;
		}

		&__menu {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			inline-size: 40px;
			block-size: 40px;
			background: transparent;
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-md);
			color: var(--text-primary);
			cursor: pointer;
		}

		&__icon {
			position: relative;
			display: block;
			inline-size: 16px;
			block-size: 2px;
			background: currentColor;
			border-radius: 1px;
			transition: background var(--dur-fast) var(--ease-out);

			&::before,
			&::after {
				content: '';
				position: absolute;
				left: 0;
				inline-size: 16px;
				block-size: 2px;
				background: currentColor;
				border-radius: 1px;
				transition: transform var(--dur-base) var(--ease-out);
			}

			&::before {
				top: -5px;
			}

			&::after {
				top: 5px;
			}

			&--open {
				background: transparent;

				&::before {
					transform: translateY(5px) rotate(45deg);
				}

				&::after {
					transform: translateY(-5px) rotate(-45deg);
				}
			}
		}
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 25;
		background: var(--scrim);

		@media (min-width: $breakpoint-lg) {
			display: none;
		}
	}

	// --- Sidebar / drawer ----------------------------------------------------
	.sidebar {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		inline-size: min(280px, 80vw);
		padding: var(--space-5) var(--space-3);
		background: var(--surface-1);
		border-left: 1px solid var(--border-subtle);
		transform: translateX(100%);
		visibility: hidden;
		transition:
			transform var(--dur-slow) var(--ease-out),
			visibility var(--dur-slow);

		&--open {
			transform: translateX(0);
			visibility: visible;
		}

		@media (min-width: $breakpoint-lg) {
			position: sticky;
			inset: 0 auto auto 0;
			block-size: 100vh;
			inline-size: auto;
			padding: 0 var(--space-3) var(--space-4);
			border-left: none;
			border-right: 1px solid var(--border-subtle);
			transform: none;
			visibility: visible;
		}

		&__footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-2);
			margin-block-start: auto;
			padding-block-start: var(--space-4);
			border-block-start: 1px solid var(--border-subtle);
		}

		&__collapse {
			display: none;
			align-items: center;
			justify-content: center;
			inline-size: 30px;
			block-size: 30px;
			background: transparent;
			border: 1px solid var(--border-subtle);
			border-radius: var(--radius-md);
			color: var(--text-tertiary);
			cursor: pointer;
			transition:
				color var(--dur-fast) var(--ease-out),
				border-color var(--dur-fast) var(--ease-out);

			&:hover {
				color: var(--text-primary);
				border-color: var(--border-strong);
			}

			svg {
				inline-size: 16px;
				block-size: 16px;
				transition: transform var(--dur-base) var(--ease-out);
			}

			@media (min-width: $breakpoint-lg) {
				display: inline-flex;
			}
		}
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;

		&__link {
			display: flex;
			align-items: center;
			gap: var(--space-3);
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-md);
			color: var(--text-secondary);
			text-decoration: none;
			font-size: var(--text-sm);
			font-weight: 500;
			transition:
				color var(--dur-fast) var(--ease-out),
				background-color var(--dur-fast) var(--ease-out);

			&:hover {
				color: var(--text-primary);
				background: var(--surface-2);
			}

			&--active {
				color: var(--accent);
				background: var(--accent-soft);
			}
		}

		&__icon {
			flex: none;
			inline-size: 18px;
			block-size: 18px;
		}
	}

	// --- Collapsed rail ------------------------------------------------------
	.app--collapsed {
		@media (min-width: $breakpoint-lg) {
			.brand__name,
			.nav__label {
				// Clipped rather than removed: the accessible name survives.
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.nav__link,
			.brand--sidebar {
				justify-content: center;
			}

			.sidebar__footer {
				flex-direction: column;
			}

			.sidebar__collapse svg {
				transform: rotate(180deg);
			}
		}
	}

	.content {
		// `inline-size: 100%` is load-bearing: <main> is a grid item, and an item with
		// auto inline margins is sized to fit-content rather than stretched (the auto
		// margins absorb the free space instead). Without it the content collapses to
		// its intrinsic width and leaves the column half empty. With a definite 100%
		// there is no free space to absorb, and the auto margins only kick in past
		// --content-max, where they do the centring we actually want.
		inline-size: 100%;
		max-inline-size: var(--content-max);
		margin-inline: auto;
		padding: var(--space-6) var(--space-4);
		min-inline-size: 0;

		@media (min-width: $breakpoint-md) {
			padding: var(--space-6) var(--space-5);
		}
	}
</style>
