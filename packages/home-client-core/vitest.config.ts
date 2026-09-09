import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'home-personalization': path.resolve(
        __dirname,
        '../home-personalization/src/index.ts',
      ),
      'farcaster-adapter': path.resolve(
        __dirname,
        '../farcaster-adapter/src/index.ts',
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
