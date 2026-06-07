import { describe, it, expect } from 'vitest'
import rules from './perms'
import rootRules from '../../instant.perms'

// Structural guard: locks the SECURITY-critical semantics of the permission
// rules so no future edit silently loosens an invariant. The rules themselves
// are pure CEL-style strings enforced live by InstantDB (proven end-to-end in
// e2e/permissions.spec.ts); this unit test guarantees the strings never drift
// from their intended meaning.
describe('permission rules (structural guard)', () => {
  it('users: own-row-only view/create/update, never deletable — protects private email', () => {
    expect(rules.users.allow.view).toBe('auth.id == data.id')
    expect(rules.users.allow.create).toBe('auth.id == data.id')
    expect(rules.users.allow.update).toBe('auth.id == data.id')
    expect(rules.users.allow.delete).toBe('false')
  })

  it('sessions: owner-only writes (not open), reads open', () => {
    expect(rules.sessions.allow.view).toBe('true')
    for (const op of ['create', 'update', 'delete'] as const) {
      const expr = rules.sessions.allow[op]
      expect(expr).not.toBe('true')
      expect(expr).toContain('isOwner')
    }
    expect(rules.sessions.bind).toContain('isOwner')
    expect(rules.sessions.bind).toContain('isAdmin')
    // isOwner is bound to the owner check; isAdmin is reserved-but-false today.
    expect(rules.sessions.bind).toContain('auth.id == data.teacherId')
    expect(rules.sessions.bind).toContain('false')
  })

  it('sessionResources: writes require ACTUAL parent-session ownership (link-based, not self-asserted), reads open', () => {
    expect(rules.sessionResources.allow.view).toBe('true')
    for (const op of ['create', 'update', 'delete'] as const) {
      const expr = rules.sessionResources.allow[op]
      expect(expr).not.toBe('true')
      expect(expr).toContain('isSessionOwner')
    }
    // Ownership is checked against the LINKED parent session's teacherId, which
    // the client cannot forge — closing the create-time injection hole.
    expect(rules.sessionResources.bind).toContain("auth.id in data.ref('session.teacherId')")
    // Guard the regression directly: the create rule MUST NOT trust the
    // client-supplied denormalized `data.teacherId` field for any write op.
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(rules.sessionResources.allow[op]).not.toContain('data.teacherId')
    }
  })

  it('sessionEvents: append-only by authenticated participant (no update/delete)', () => {
    expect(rules.sessionEvents.allow.create).toBe('auth.id != null')
    expect(rules.sessionEvents.allow.update).toBe('false')
    expect(rules.sessionEvents.allow.delete).toBe('false')
  })

  it('participants: owner-scoped writes (own row or owning teacher), no email, reads open', () => {
    // The participant rule block carries no field-level email rule (privacy is
    // structural — the field is removed from the entity, not masked by a rule).
    expect(JSON.stringify(rules.participants).toLowerCase()).not.toContain('email')
    // Reads stay open so presence/roster is visible.
    expect(rules.participants.allow.view).toBe('true')
    for (const op of ['create', 'update', 'delete'] as const) {
      const expr = rules.participants.allow[op]
      // Regression guards: no longer fail-open, no longer the old `auth.id != null`.
      expect(expr).not.toBe('true')
      expect(expr).not.toBe('auth.id != null')
      expect(expr).toContain('isOwnRow')
    }
    // Own-row self-join admitted via `auth.id == data.userId`; teacher ownership is
    // checked against the LINKED parent session (forgery-proof), not a field.
    expect(rules.participants.bind).toContain('auth.id == data.userId')
    expect(rules.participants.bind).toContain("auth.id in data.ref('session.teacherId')")
    expect(rules.participants.bind).toContain('isAdmin')
  })

  it('$default stays open so todos and Batch-2 namespaces keep today behavior', () => {
    expect(rules.$default.allow.$default).toBe('true')
  })

  it('root instant.perms.ts re-exports the single source unchanged', () => {
    // The CLI loads the root adapter; it MUST be the exact same object the guard
    // above pins, or the pushed rules diverge from the tested ones.
    expect(rootRules).toBe(rules)
  })
})
