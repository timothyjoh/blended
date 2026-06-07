## Summary

Cycle 0012 ships a realtime, owner-scoped session list on the teacher `/dashboard`, all five PLAN.md tasks complete.

**Files created**
- `src/components/SessionList.tsx` (115 lines) — the new `client:only="react"` island. Reads identity via `useAuth`, runs a single owner-scoped live query `db.useQuery(user?.id ? { sessions: { $: { where: { teacherId: user.id } } } } : null)` (server-side filter, null-guarded until the id resolves), and renders explicit mutually-exclusive states with the SPEC-fixed testids: unresolved-auth → `return null`, error → inline `role="alert"` (`session-list-error`) + `console.error('[SessionList] …')`, loading → `session-list-loading`, empty → `session-list-empty`, populated → `<a href="/dashboard/sessions/:id">` rows carrying `data-session-id`, title (with fallback) + status only.
- `e2e/dashboard-session-list.spec.ts` (146 lines) — five legs (empty / happy / realtime second-context / navigation into `session-root` / cross-teacher scoping), skips loudly without admin env, explicit testid waits, never `networkidle`.
- `docs/cycle/0012-feature-teacher-dashboard-session-list-open/walkthrough.mjs` (101 lines) — drives `/login` → `/dashboard` empty list → create session → live row → click-through to `/dashboard/sessions/:id`, with named captures `01-login` … `05-facilitation-view`; bare-`node` runnable (playwright + `@instantdb/admin` only).

**Files modified**
- `src/lib/sessions.ts` (+39) — Task 1: pure, db-free, total helpers `sessionDisplayTitle`, `compareSessionsForList`, `SESSION_LIST_TITLE_FALLBACK`, and `SessionListRow`.
- `src/lib/sessions.test.ts` (+74) — Task 3: `describe('SessionList display helpers …')` covering happy + hostile input (empty/whitespace/null/undefined title → placeholder; equal/missing/null `createdAt` → id tie-break, no NaN; empty list → `[]`; stable mixed fixture).
- `src/pages/dashboard/index.astro` (+7) — mounts `<SessionList client:only="react" />` beside `NewSession` inside `RouteGuard`.
- `AGENTS.md` (+1 cycle-0012 Data Layer note with the full testid list) and `README.md` (+15, "Your sessions on the dashboard").

**Test commands & results**
- Full suite: `npm test` (`vitest run`) → **265 passed (8 files)**.
- Coverage: `npm run test:coverage` → All files **86.09% stmts / 82.1% branch / 77.55% funcs / 88.37% lines**; `src/lib/sessions.ts` **94.47 / 87.75 / 81.48 / 96.5** — improved by the new tests, no regression. Coverage scope is `src/lib/**/*.ts` (`vitest.config.ts:17`); React islands are deliberately excluded and exercised by e2e, so `SessionList.tsx` is not unit-measured and cannot regress the gate.
- `npm run astro check` → **0 errors, 0 warnings** (the `ts(6385) ElementRef` deprecation hints are pre-existing in shadcn `src/components/ui/*` files, not introduced here).
- `npm run test:e2e` could not execute in this sandbox: the Playwright `webServer` (`npm run dev`) fails to boot because `PUBLIC_INSTANTDB_APP_ID` is unset (`src/lib/db.ts:26`) — an environment limitation affecting every spec equally, not a regression. The new spec parses and lists its 5 tests (`--list` verified) and follows the sibling skip-loudly idiom; `playwright.config.ts` already sets `retries: 3`.

**Failure modes handled & their tests**
- Live-query error → inline `role="alert"` (`session-list-error`) + `console.error('[SessionList] …')`, error branch checked **before** the empty computation so an errored query never renders as falsely-empty (e2e + structural; matches `SessionLifecycle` precedent).
- Unresolved auth → `null` passed to `db.useQuery` (no unscoped query) and `return null` (nothing actionable).
- Loading → explicit `session-list-loading`, never a flash of "no sessions".
- Missing/blank title → `sessionDisplayTitle` non-blank placeholder so a row stays clickable — unit-tested over `''`/whitespace/`null`/`undefined`.
- Unstable/NaN ordering over absent timestamps → `compareSessionsForList` treats missing `createdAt` as 0 and tie-breaks by id — unit-tested (equal/null/undefined timestamps, empty list, mixed hostile fixture).
- Idempotency: the surface is read-only (live query + navigation); re-render/remount is inherently safe, no writes/locks needed (per RESEARCH.md).

**Deviations from PLAN.md**: none of substance. The plan sketched the populated/empty/loading/error branches as separate testid'd elements; I wrapped each in the shared `Card`/`CardTitle "Your sessions"` for visual parity with siblings (as the plan's "Wrap the list in a Card" note directs) while keeping every SPEC-fixed testid and the error-before-empty ordering exactly as specified.

**Deferred / follow-up**: `sessions.teacherId` remains un-indexed (`src/lib/db.ts:48-59`) — fine at MVP scale under open-read rules; a server-side index is a separate cycle if query performance ever matters (flagged in PLAN.md, not addressed here). The e2e realtime/scoping legs require a live Instant app + `INSTANT_ADMIN_TOKEN` to actually execute (unavailable in this sandbox).

## Touched Files
- src/lib/sessions.ts
- src/lib/sessions.test.ts
- src/components/SessionList.tsx
- src/pages/dashboard/index.astro
- e2e/dashboard-session-list.spec.ts
- AGENTS.md
- README.md
- docs/cycle/0012-feature-teacher-dashboard-session-list-open/walkthrough.mjs
