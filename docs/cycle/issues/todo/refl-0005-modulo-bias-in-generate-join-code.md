---
id: refl-0005-modulo-bias-in-generate-join-code
title: Eliminate modulo bias in generateJoinCode via rejection sampling
workflow: feature
depends_on: []
triaged_at: 2026-06-07T05:46:50.638Z
source: triage
priority: low
---
## Context

`generateJoinCode` (`src/lib/sessions.ts:39`) maps each random byte to an alphabet index via `bytes[i] % JOIN_CODE_ALPHABET.length`. Because `256 % 31 = 8`, alphabet indices 0–7 of the 31-char alphabet are drawn marginally more often than indices 8–30, introducing a small modulo bias in the generated join codes.

REVIEW assessed this as minor and non-blocking: the source remains a CSPRNG, the ~49 bits of entropy keep codes unguessable, and SPEC §16.2 is satisfied. This is tracked as a known correctness nuance worth closing if join codes ever need a provably uniform distribution. Low priority under the current threat model.

## Goal

Remove the modulo bias so each character of a join code is uniformly distributed over the alphabet, without changing the alphabet, code length, or the public API of `generateJoinCode`.

## Approach

Use rejection sampling: discard any random byte `>= 256 - (256 % JOIN_CODE_ALPHABET.length)` (i.e. `>= 248` for a 31-char alphabet) and redraw, then apply the modulo. This yields a uniform mapping while keeping the CSPRNG source and the existing length/alphabet.

## Constraints

- Keep the pure, injectable-RNG core so the behavior stays deterministically testable.
- No change to alphabet, code length, or call sites.

## Acceptance

- `generateJoinCode` no longer uses a biased `% length` mapping; out-of-range bytes are rejected and redrawn.
- A deterministic unit test (using the injectable RNG) demonstrates the rejection path and confirms uniform mapping / no out-of-range index selection.
- Existing join-code behavior (length, alphabet membership, SPEC §16.2) remains satisfied.
