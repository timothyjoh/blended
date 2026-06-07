#!/usr/bin/env bash
# Walkthrough capture launcher (engine-intercepted `walkthrough_capture` step).
# Thin: delegates to the Node runner, which boots blended's Astro dev server,
# drives Playwright, and writes media into $CYCLE_ARTIFACT_DIR/walkthrough/.
# No project .ts imports → a bare `node` is fine.
set -u
exec node scripts/walkthrough-capture.mjs
