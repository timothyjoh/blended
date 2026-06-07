// ---------------------------------------------------------------------------
// Blended message classification seam (cycle 0009).
//
// This module is the SINGLE point that decides whether a student chat message
// becomes a teacher-facing Question. Today it is an interim, AI-free heuristic
// (a message is a question iff its trimmed text ends with `?`). Batch 2 swaps in
// a real AI call by editing ONLY `classifyMessage`'s body — no other code path,
// schema, or fold changes. Keeping the decision behind this one pure, total
// function is the whole point of the cycle (CONTEXT.md, SPEC §9.1).
// ---------------------------------------------------------------------------

/**
 * The interim, AI-free message→Question decision seam. Pure and total: any
 * input — including `null`, `undefined`, empty, or whitespace-only text —
 * returns a result without throwing. The text is trimmed first (mirroring the
 * trimming `buildChatMessage` applies before storage) and `isQuestion` is true
 * iff the trimmed text is non-empty and ends with `?`.
 *
 * This is the ONLY place the trailing-`?` rule lives — there is no inline
 * `endsWith('?')` anywhere in the submit path, the component, or the fold, so
 * Batch 2 replaces only this function's body.
 */
export function classifyMessage(text: string | null | undefined): { isQuestion: boolean } {
  const trimmed = (text ?? '').trim()
  return { isQuestion: trimmed.length > 0 && trimmed.endsWith('?') }
}

/**
 * Fixed 16-byte namespace for deriving a deterministic question id from a
 * message UUID. The high nibble of byte[6] and the top two bits of byte[8] are
 * zero so the source UUID's version (4) and variant bits pass through the XOR
 * unchanged — the derived id keeps a structurally valid v4 shape that InstantDB
 * accepts. Every other byte is non-zero so the derived id is never equal to the
 * source id.
 */
const QUESTION_ID_NAMESPACE = Uint8Array.from([
  0x71, 0x75, 0x65, 0x73, 0x74, 0x69, 0x0e, 0x6e,
  0x31, 0x64, 0x6e, 0x73, 0x30, 0x30, 0x30, 0x39,
])

/**
 * Pure, deterministic, bijective derivation of a `questions` row id from the
 * source `messages` row id. No `uuid` library is available and the caller must
 * stay synchronous (no async `crypto.subtle`), so rather than hashing we parse
 * the 16 bytes of the source UUID, XOR them byte-wise with `QUESTION_ID_NAMESPACE`,
 * and re-format as `8-4-4-4-12`.
 *
 * XOR-with-a-fixed-constant is injective, so distinct message ids yield distinct
 * (collision-free) question ids, and re-running the same logical submit derives
 * the SAME question id — giving the `questions` row the same keyed-upsert
 * idempotency the `messages` row already has. The namespace preserves the
 * version/variant bits so the result is a valid v4-shaped UUID, and is non-zero
 * in the pass-through positions so `deriveQuestionId(id) !== id`.
 *
 * Assumes a UUID-shaped input (always supplied by `buildChatMessage`'s
 * `id()`-minted `clientActionId`); a non-hex input throws, surfacing a
 * structurally impossible plan rather than silently producing garbage.
 */
export function deriveQuestionId(messageId: string): string {
  const hex = messageId.replace(/-/g, '')
  if (hex.length !== 32 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error(`deriveQuestionId: not a UUID-shaped id: "${messageId}"`)
  }
  const out = new Array<string>(16)
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ QUESTION_ID_NAMESPACE[i]
    out[i] = byte.toString(16).padStart(2, '0')
  }
  const h = out.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
