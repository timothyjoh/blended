import { defineConfig } from 'vitest/config'

// Unit tests for pure logic modules (the `applyEvent` fold, `requireAppId`).
// Importing `src/lib/db.ts` runs the module-level `requireAppId(import.meta.env
// .PUBLIC_INSTANTDB_APP_ID)` guard, so a value must be defined for the import to
// succeed. The env-guard *negative* path is covered by calling `requireAppId('')`
// directly — not by unsetting this.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    env: {
      PUBLIC_INSTANTDB_APP_ID: 'test-app-id',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // The unit-coverage scope is pure-logic modules. `useAuth.ts` is a React
      // hook seam (calls `db.useAuth()` / `db.useQuery()` — needs a React runtime
      // + live InstantDB client); its pure decision logic is extracted to
      // `auth.ts` (unit-covered) and the hook itself is exercised by the
      // Playwright auth suite (`e2e/auth.spec.ts`), consistent with how the
      // `.tsx` React islands are already outside this scope.
      exclude: ['src/**/*.test.ts', 'src/lib/useAuth.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
})
