// CLI entrypoint for `instant-cli push schema`. The schema itself lives in
// `src/lib/db.ts` (the single, unit-tested source — exactly one schema literal).
// This root adapter exists only because `instant-cli` expects to load
// `instant.schema.ts` from the project root and reads its DEFAULT export; it
// re-exports the canonical `schema` as both default and named so there is exactly
// one definition (mirroring how `instant.perms.ts` re-exports the perms object).
export { schema as default, schema } from './src/lib/db'
