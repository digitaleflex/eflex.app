import { defineConfig } from 'vitest/config';

// La suite racine ne couvre que les packages TypeScript du workspace pnpm.
// La console `apps/cloud` a sa propre configuration Vitest (npm, jsdom).
export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts'],
  },
});
