<script lang="ts">
	import '$lib/styles/global.scss';
	import { page } from '$app/state';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/income', label: 'Income' },
		{ href: '/expenses', label: 'Expenses' },
		{ href: '/funds', label: 'Funds' },
		{ href: '/net-worth', label: 'Net Worth' },
		{ href: '/categories', label: 'Categories' },
		{ href: '/insights', label: 'Insights' }
	];

	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();

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
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
	<header class="app__header">
		<a class="app__brand" href="/">Cash Flow</a>

		<nav class="nav nav--desktop" aria-label="Primary">
			{#each links as link}
				<a
					class="nav__link"
					class:nav__link--active={page.url.pathname === link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					href={link.href}
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<button
			bind:this={menuButton}
			class="app__menu-button"
			type="button"
			aria-expanded={menuOpen}
			aria-controls="mobile-nav"
			aria-label="Menu"
			onclick={() => (menuOpen = !menuOpen)}
		>
			<span class="app__menu-icon" class:app__menu-icon--open={menuOpen} aria-hidden="true"></span>
		</button>
	</header>

	{#if menuOpen}
		<button
			class="app__scrim"
			type="button"
			tabindex="-1"
			aria-label="Close menu"
			onclick={() => closeMenu(true)}
		></button>
	{/if}

	<aside id="mobile-nav" class="app__drawer" class:app__drawer--open={menuOpen}>
		<nav class="nav nav--drawer" aria-label="Primary">
			{#each links as link}
				<a
					class="nav__link"
					class:nav__link--active={page.url.pathname === link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					href={link.href}
					tabindex={menuOpen ? undefined : -1}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</aside>

	<main class="app__content">
		{@render children()}
	</main>
</div>

<style lang="scss">
	@use 'variables' as *;

	.app {
		min-height: 100vh;

		&__header {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-md;
			height: $header-height;
			padding: 0 $space-lg;
			background: rgba(18, 22, 31, 0.85);
			backdrop-filter: blur(12px);
			border-bottom: 1px solid $color-border;
		}

		&__brand {
			font-size: $text-lg;
			font-weight: 700;
			color: $color-text;
			text-decoration: none;
			letter-spacing: -0.02em;
		}

		&__menu-button {
			display: none;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			background: transparent;
			border: 1px solid $color-border;
			border-radius: $radius;
			cursor: pointer;

			@media (max-width: #{$breakpoint-md - 1px}) {
				display: inline-flex;
			}
		}

		&__menu-icon {
			position: relative;
			display: block;
			width: 16px;
			height: 2px;
			background: $color-text;
			border-radius: 1px;
			transition: background 120ms ease;

			&::before,
			&::after {
				content: '';
				position: absolute;
				left: 0;
				width: 16px;
				height: 2px;
				background: $color-text;
				border-radius: 1px;
				transition: transform 160ms ease;
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

		&__scrim {
			position: fixed;
			inset: 0;
			z-index: 25;
			background: rgba(4, 6, 10, 0.6);
			border: none;
			padding: 0;
			cursor: default;
		}

		&__drawer {
			position: fixed;
			top: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			width: min(280px, 80vw);
			padding: $space-xl $space-lg;
			background: $color-surface;
			border-left: 1px solid $color-border;
			transform: translateX(100%);
			transition: transform 200ms ease;
			visibility: hidden;

			&--open {
				transform: translateX(0);
				visibility: visible;
			}
		}

		&__content {
			max-width: 1100px;
			margin: 0 auto;
			padding: $space-xl $space-lg;
		}
	}

	.nav {
		&--desktop {
			display: flex;
			gap: $space-xs;

			@media (max-width: #{$breakpoint-md - 1px}) {
				display: none;
			}
		}

		&--drawer {
			display: flex;
			flex-direction: column;
			gap: $space-xs;
		}

		&__link {
			padding: $space-sm $space-md;
			border-radius: $radius;
			color: $color-text-muted;
			text-decoration: none;
			font-size: $text-sm;
			font-weight: 500;
			transition:
				color 120ms ease,
				background-color 120ms ease;

			&:hover {
				color: $color-text;
				background: $color-surface-raised;
			}

			&--active {
				color: $color-primary;
				background: rgba(124, 154, 255, 0.12);

				&:hover {
					color: $color-primary-hover;
					background: rgba(124, 154, 255, 0.16);
				}
			}
		}
	}
</style>
