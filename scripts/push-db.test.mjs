import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Hermetic, no-mock orchestrator test (cycle 0022). Spawns the REAL
// `scripts/push-db.mjs`, which spawns the REAL schema/perms runners, which shell
// out to `npx`. We replace ONLY `npx` with a PATH-shim stub (matching the
// pattern in pushSchema.test.ts / pushPerms.test.ts) so the orchestrator's
// ordering and stop-on-failure semantics are exercised end-to-end against a
// parameterisable CLI — never by mocking `child_process`.

const runnerPath = fileURLToPath(new URL('./push-db.mjs', import.meta.url))
const dirs = []

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

// Build a throwaway shim dir containing an executable `npx` that records each
// push kind it is called with (to a marker file) and exits with a per-kind code
// from env. The marker lets us assert ordering AND the absence of the perms call
// on a schema failure.
function makeShim() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dbpush-'))
  dirs.push(dir)
  const marker = path.join(dir, 'calls.log')
  const npx = path.join(dir, 'npx')
  writeFileSync(
    npx,
    [
      '#!/usr/bin/env node',
      'const fs = require("node:fs")',
      // npx instant-cli push <kind> --app <id>  →  <kind> is argv[4]
      'const kind = process.argv[4]',
      'fs.appendFileSync(process.env.STUB_MARKER, kind + "\\n")',
      'const code = kind === "schema" ? Number(process.env.STUB_SCHEMA_EXIT||0) : Number(process.env.STUB_PERMS_EXIT||0)',
      'process.exit(code)',
      '',
    ].join('\n')
  )
  chmodSync(npx, 0o755)
  return { dir, marker }
}

function run({ schemaExit = 0, permsExit = 0, appId = 'test-app-id' } = {}) {
  const { dir, marker } = makeShim()
  const env = {
    ...process.env,
    PATH: dir + path.delimiter + process.env.PATH,
    PUBLIC_INSTANTDB_APP_ID: appId,
    STUB_MARKER: marker,
    STUB_SCHEMA_EXIT: String(schemaExit),
    STUB_PERMS_EXIT: String(permsExit),
  }
  const result = spawnSync(process.execPath, [runnerPath], { env, encoding: 'utf8' })
  const calls = existsSync(marker)
    ? readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean)
    : []
  return { result, calls }
}

describe('push-db.mjs orchestrator (hermetic, real runners, stubbed npx)', () => {
  it('happy path: pushes schema THEN perms in that order and exits 0', () => {
    const { result, calls } = run()
    expect(result.status).toBe(0)
    expect(calls).toEqual(['schema', 'perms'])
  })

  it('schema failure HALTS the run non-zero, names the schema step, and perms is NEVER invoked', () => {
    const { result, calls } = run({ schemaExit: 3 })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('db:push: schema step failed')
    // The ordering/halt guarantee: the perms command was provably never run.
    expect(calls).toEqual(['schema'])
    expect(calls).not.toContain('perms')
  })

  it('empty PUBLIC_INSTANTDB_APP_ID exits non-zero BEFORE any CLI call and never reaches perms', () => {
    const { result, calls } = run({ appId: '' })
    expect(result.status).not.toBe(0)
    // Inherited from the schema runner's precondition — no npx call at all.
    expect(result.stderr).toContain('push-schema:')
    expect(result.stderr).toContain('PUBLIC_INSTANTDB_APP_ID')
    expect(calls).toEqual([])
  })

  it('perms failure after a successful schema push exits non-zero and names the perms step', () => {
    const { result, calls } = run({ permsExit: 4 })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('db:push: perms step failed')
    expect(calls).toEqual(['schema', 'perms'])
  })

  it('forwards the schema exit code rather than collapsing it to a generic 1', () => {
    const { result } = run({ schemaExit: 3 })
    expect(result.status).toBe(3)
  })

  it('is idempotent: a re-run against the success stub still exits 0 with the same ordering', () => {
    const first = run()
    const second = run()
    expect(first.result.status).toBe(0)
    expect(second.result.status).toBe(0)
    expect(first.calls).toEqual(['schema', 'perms'])
    expect(second.calls).toEqual(['schema', 'perms'])
  })
})
