import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/cases/unit/**/*.test.js',
      'tests/cases/integration/**/*.test.js',
      'tests/cases/system/**/*.test.js',
      'tests/smoke/unit.smoke.test.js',
      'tests/smoke/integration.smoke.test.js',
      'tests/smoke/system.smoke.test.js',
    ],
    environment: 'node',
  },
});
