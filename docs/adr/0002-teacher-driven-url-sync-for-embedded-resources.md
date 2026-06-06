# Teacher-driven URL state for resource sync

**Status:** accepted

## Context & decision

Students must stay in sync with where the teacher is in a resource, including slide-level position for decks (e.g. slides.com) where each slide is its own route/URL. The obvious approach — read the embedded iframe's current URL as the teacher clicks through the deck — is impossible for cross-origin embeds (same-origin policy hides the iframe's internal navigation), and depending on it would also violate spec non-goal #3.

We will make Blended **own the resource's current URL as explicit state**. The teacher advances position through Blended's own chrome (prev/next over the resource's slide-URL list, or a current-URL field), which writes a `currentUrl` change that broadcasts to all students. Students load each broadcast URL, may scroll/click/navigate locally within their own iframe, and re-sync to the teacher on the next broadcast.

## Consequences

- The teacher does **not** sync by clicking inside the embedded deck — they drive navigation via Blended controls. Accepted trade-off for cross-origin safety and broad provider coverage.
- **postMessage / provider embed APIs** (reveal.js, possibly Google Slides) could later let the teacher click inside the deck and still sync. That is a deliberate **next-phase exploration spike**, not part of this phase.
- Sync granularity is the URL, not pixel position; intra-page scroll stays local per student.
