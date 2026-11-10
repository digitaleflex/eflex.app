import path from 'node:path';
import { defineConfig } from 'vitest/config';

// La suite racine couvre les packages TypeScript du workspace pnpm et les modules
// sans dépendance du portail (analyse d'URL, analyse de dépôt).
export default defineConfig({
  resolve: {
    alias: {
      '@eflex/detector': path.resolve(__dirname, 'packages/detector/src/index.ts'),
      '@eflex/renderer': path.resolve(__dirname, 'packages/renderer/src/index.ts'),
      '@': path.resolve(__dirname, 'portail/src'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'portail/src/**/*.test.ts'],
    // Refuse une base de production quand EFLEX_TEST_DB=1 (voir le module).
    setupFiles: ['portail/src/lib/test-support/require-test-db.ts'],
  },
});
