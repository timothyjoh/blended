// CLI entrypoint for `instant-cli push perms`. The rules themselves live in
// `src/lib/perms.ts` (the single, unit-tested source). This root adapter exists
// only because `instant-cli` expects to load `instant.perms.ts` from the project
// root; it re-exports the canonical object so there is exactly one definition.
export { default } from './src/lib/perms'
