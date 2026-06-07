---
id: refl-0005-modulo-bias-in-generate-join-code
source: reflection
title: modulo-bias-in-generate-join-code
added_at: 2026-06-07T05:42:46.296Z
triage_attempts: 0
priority: low
origin_cycle_id: "0005"
---

`generateJoinCode` maps each random byte to an alphabet index via `bytes[i] % JOIN_CODE_ALPHABET.length` (`src/lib/sessions.ts:39`). Because `256 % 31 = 8`, indices 0–7 of the 31-char alphabet are marginally more likely than 8–30, introducing a small modulo bias. REVIEW assessed this as minor and non-blocking — the source is still a CSPRNG, the ~49 bits of entropy keep the code unguessable, and SPEC §16.2 is satisfied.

It remains a known correctness nuance worth closing if join codes ever need a provably uniform distribution. The fix is rejection sampling (discard bytes ≥ `256 - (256 % 31)` and redraw), which eliminates the bias without changing the alphabet or length. Low priority given the current threat model, but the pure, injectable-RNG core makes it cheap to add and test deterministically in a future cycle.
