import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
  ],
  esbuild: {
    loader: 'jsx',
    include: /\.[jt]sx?$/,
    exclude: [],
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/data/**',
        'src/lib/firebase/config.js',
        'src/lib/firebase/admin.js',
        'src/app/actions.js',
        'src/app/layout.js',
        'src/components/DietShooter.js',
      ],
      thresholds: {
        statements: 84,
        branches: 74,
        functions: 74,
        lines: 86,
      },
    },
    environmentMatchGlobs: [
      ['tests/server/**', 'node'],
      ['tests/unit/gemini-client.test.js', 'node'],
      ['tests/unit/pushHelper.test.js', 'node'],
    ],
  },
});
