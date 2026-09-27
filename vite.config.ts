import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	css: {
		preprocessorOptions: {
			scss: {
				// Lets components write `@use 'breakpoints' as *;`
				loadPaths: ['src/lib/styles']
			}
		}
	}
});
