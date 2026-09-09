import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The kernel is a workspace sibling; resolve it from source so tests run
      // without a build step, exactly as tsconfig paths does for typechecking.
      'home-personalization': path.resolve(
        __dirname,
        '../home-personalization/src/index.ts',
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
