import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveAppId } from './pushPerms'

const runnerPath = fileURLToPath(new URL('../../scripts/push-perms.mjs', import.meta.url))

describe('resolveAppId', () => {
  it('returns the app id when present', () => {
    expect(resolveAppId({ PUBLIC_INSTANTDB_APP_ID: 'x' })).toBe('x')
  })

  it('throws a clear PUBLIC_INSTANTDB_APP_ID message when missing', () => {
    expect(() => resolveAppId({})).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
  })

  it('throws when the app id is empty/whitespace (never silently push)', () => {
    expect(() => resolveAppId({ PUBLIC_INSTANTDB_APP_ID: '' })).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
    expect(() => resolveAppId({ PUBLIC_INSTANTDB_APP_ID: '   ' })).toThrow(/PUBLIC_INSTANTDB_APP_ID/)
  })
})

describe('push-perms.mjs runner (failure path, no network)', () => {
  it('exits non-zero with a clear message when the app id is missing — before any CLI call', () => {
    // Spawn the REAL runner with an empty app id. It must exit before spawning
    // instant-cli, proving the missing-credentials failure path deterministically
    // (the "unavailable app" half is the CLI's forwarded non-zero exit, an
    // operator-verified path documented in the SPEC traceability table).
    const env = { ...process.env, PUBLIC_INSTANTDB_APP_ID: '' }
    const result = spawnSync(process.execPath, [runnerPath], { env, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('push-perms:')
    expect(result.stderr).toContain('PUBLIC_INSTANTDB_APP_ID')
  })
})
