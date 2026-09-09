import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Resolve workspace siblings from source, so `pnpm demo` runs without a build
 * step. Mirrors the aliases in vitest.config.ts and the paths in tsconfig.json.
 */
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
});
