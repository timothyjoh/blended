// ---------------------------------------------------------------------------
// Pure precondition logic for the schema-push wrapper (cycle 0021). Kept here,
// db-free and unit-testable, so the "push must fail loudly" SPEC requirement is
// covered deterministically without a network call. The runner that shells out
// to `instant-cli` is `scripts/push-schema.mjs`, which mirrors this one-line spec
// (a `.mjs` runner cannot import this `.ts` without a loader). Mirrors
// `src/lib/pushPerms.ts` — same shape, distinct `push-schema:` message prefix.
// ---------------------------------------------------------------------------

/**
 * Resolve the Instant app id for a schema push, or throw a clear error. Pure and
 * total over its input — never performs I/O. The push must NEVER silently target
 * a missing app and report success, so a missing/empty id throws here, before
 * any CLI invocation.
 */
export function resolveAppId(env: Record<string, string | undefined>): string {
  const appId = env.PUBLIC_INSTANTDB_APP_ID
  if (!appId || appId.trim() === '') {
    throw new Error(
      'push-schema: PUBLIC_INSTANTDB_APP_ID is missing or empty — cannot push schema (set it in .env)'
    )
  }
  return appId
}
