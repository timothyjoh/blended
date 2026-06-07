# Final Fixes — Cycle 0005

> Footprint: AGENTS.md, README.md, e2e/support/auth.ts, release-notes.md, src/components/NewSession.tsx, src/lib/sessions.test.ts, src/lib/sessions.ts, src/pages/dashboard/index.astro

## Fix 1: tighten-e2e-join-code-assertion-to-length-and-charset

The create-session happy-path e2e asserts the surfaced join code only with `expect(joinCode).toBeTruthy()` (`e2e/create-session.spec.ts:34`). REVIEW flagged this as a weak assertion: a single non-empty character would pass, so the spec would not catch a regression that shortened or corrupted the code shown to the teacher.

This is a mechanical tightening in a file already touched this cycle — assert the code is exactly `JOIN_CODE_LENGTH` (10) characters and that every character is a member of `JOIN_CODE_ALPHABET`. No design decision is required; the constants are already exported from `src/lib/sessions.ts`.
