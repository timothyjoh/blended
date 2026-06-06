import { defineConfig } from 'vitest/config'

// Unit tests for pure logic modules (the `applyEvent` fold, `requireAppId`).
// Importing `src/lib/db.ts` runs the module-level `requireAppId(import.meta.env
// .PUBLIC_INSTANTDB_APP_ID)` guard, so a value must be defined for the import to
// succeed. The env-guard *negative* path is covered by calling `requireAppId('')`
// directly — not by unsetting this.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      PUBLIC_INSTANTDB_APP_ID: 'test-app-id',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
})
