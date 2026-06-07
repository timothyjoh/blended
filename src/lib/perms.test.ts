import { describe, it, expect } from 'vitest'
import rules from './perms'
import rootRules from '../../instant.perms'
import { schema } from './db'

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

  it('$default denies by default — no entity falls back to world-open', () => {
    expect(rules.$default.allow.$default).toBe('false')
    expect(rules.$default.allow.$default).not.toBe('true')
  })

  it('every schema entity has an explicit rule (no silent fall-through)', () => {
    // Schema-driven so a FUTURE entity added without a permission rule surfaces
    // here as a concrete failing expectation, never a silent world-open default.
    for (const name of Object.keys(schema.entities)) {
      expect(
        rules,
        `schema entity "${name}" must have an explicit permission rule`
      ).toHaveProperty(name)
    }
  })

  it('messages: participant-scoped create + row-owner/owning-teacher update/delete, reads open (cycle 0014)', () => {
    // No longer fail-open: the key is gone, there is an explicit block.
    expect(rules.messages.allow).not.toHaveProperty('$default')
    // READ stays open by design so the live cross-student stream renders.
    expect(rules.messages.allow.view).toBe('true')
    // CREATE is participant-scoped AND anti-spoof, never bare `auth.id != null`.
    expect(rules.messages.allow.create).not.toBe('true')
    expect(rules.messages.allow.create).not.toBe('auth.id != null')
    expect(rules.messages.allow.create).toContain('isAuthor')
    expect(rules.messages.allow.create).toContain('scalarMatchesLink')
    // UPDATE/DELETE = author, owning teacher, or reserved admin slot — not open.
    for (const op of ['update', 'delete'] as const) {
      const expr = rules.messages.allow[op]
      expect(expr).not.toBe('true')
      expect(expr).toContain('isAuthor')
      expect(expr).toContain('isOwningTeacher')
      expect(expr).toContain('isAdmin')
    }
    // The author and anti-spoof checks traverse the LINKED participant, and the
    // owning-teacher check the LINKED session — all forgery-proof, never a
    // client-supplied scalar.
    expect(rules.messages.bind).toContain("auth.id in data.ref('participant.userId')")
    expect(rules.messages.bind).toContain("data.participantId in data.ref('participant.id')")
    expect(rules.messages.bind).toContain("auth.id in data.ref('session.teacherId')")
    expect(rules.messages.bind).toContain('isAdmin')
    expect(rules.messages.bind).toContain('false')
    // Regression / anti-forgery: no write op may trust a client-supplied scalar
    // (`data.teacherId` / `data.userId`) in place of the link traversal.
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(rules.messages.allow[op]).not.toContain('data.teacherId')
      expect(rules.messages.allow[op]).not.toContain('data.userId')
    }
  })

  it('formerly-default-governed entities are explicitly open (intent visible, not inherited)', () => {
    for (const name of ['todos', 'questions', 'endorsements'] as const) {
      expect(rules[name].allow.$default).toBe('true')
    }
  })

  it('root instant.perms.ts re-exports the single source unchanged', () => {
    // The CLI loads the root adapter; it MUST be the exact same object the guard
    // above pins, or the pushed rules diverge from the tested ones.
    expect(rootRules).toBe(rules)
  })
})
