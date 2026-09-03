/** Primary navigation. Icons are 24×24 stroke paths, drawn in Sidebar/drawer markup. */
export const navLinks = [
	{ href: '/', label: 'Dashboard', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
	{ href: '/income', label: 'Income', icon: 'M12 4v10m0 0 4-4m-4 4-4-4M4 20h16' },
	{ href: '/expenses', label: 'Expenses', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9.5 8h5M9.5 12h5' },
	{ href: '/funds', label: 'Funds', icon: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5' },
	{ href: '/net-worth', label: 'Net Worth', icon: 'M3 17l6-6 4 4 7-7m0 0h-5m5 0v5' },
	{ href: '/categories', label: 'Categories', icon: 'M20.6 13.4 11 3.8V3H3v8h.8l9.6 9.6a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8ZM6.8 6.8h.01' },
	{ href: '/insights', label: 'Insights', icon: 'M12 3a6 6 0 0 0-3 11.2V17h6v-2.8A6 6 0 0 0 12 3ZM9.5 20h5' }
] as const;
