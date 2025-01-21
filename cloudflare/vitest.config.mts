import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		// Specifies the test environment
		environment: 'cloudflare-workers',

		// Pool options for Workers
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.toml',
				},
			},
		},

		globals: true,
		include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

		testTimeout: 10000,

		silent: false,
	},
});
