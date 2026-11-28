import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@gms/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // A vékony belépési pontok (process.argv / process.exit) külön folyamatban futnak.
      exclude: [
        'src/main.ts',
        'src/cli/import.ts',
        'src/cli/restore-main.ts',
        'src/cli/ops-main.ts',
      ],
      thresholds: { lines: 90 },
    },
  },
});
