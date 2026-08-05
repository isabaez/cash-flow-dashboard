<script lang="ts">
	import '$lib/styles/global.scss';
	import { page } from '$app/state';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/income', label: 'Income' },
		{ href: '/expenses', label: 'Expenses' },
		{ href: '/funds', label: 'Funds' },
		{ href: '/categories', label: 'Categories' }
	];
</script>

<div class="app">
	<aside class="app__sidebar">
		<div class="app__brand">Cash Flow</div>
		<nav class="nav">
			{#each links as link}
				<a
					class="nav__link"
					class:nav__link--active={page.url.pathname === link.href}
					href={link.href}
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
		display: flex;
		min-height: 100vh;

		&__sidebar {
			width: $sidebar-width;
			flex-shrink: 0;
			background: $color-surface;
			border-right: 1px solid $color-border;
			padding: $space-lg $space-md;
		}

		&__brand {
			font-size: $text-lg;
			font-weight: 700;
			margin-bottom: $space-lg;
			padding: 0 $space-sm;
		}

		&__content {
			flex: 1;
			padding: $space-xl;
			max-width: 1100px;
		}
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: $space-xs;

		&__link {
			padding: $space-sm;
			border-radius: $radius;
			color: $color-text;
			text-decoration: none;
			font-size: $text-sm;

			&:hover {
				background: $color-bg;
			}

			&--active {
				background: $color-primary;
				color: #fff;

				&:hover {
					background: $color-primary-hover;
				}
			}
		}
	}
</style>
