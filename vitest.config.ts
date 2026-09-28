import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
	},
	// n8n-workflow ships source maps without their sources, which prints a warning per file.
	css: false,
	esbuild: { sourcemap: false },
});
