# Phase 8: Load & Capacity Verification - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

A scripted test proves the server holds a full game with 12+ simultaneous players
(submitting captions, rating memes) without crashing, hanging, or requiring a restart —
using automated clients, not real guests, so room capacity is verified without risking
the surprise.

</domain>

<decisions>
## Implementation Decisions

### Test Target
- **D-01:** The load test runs against a server instance started locally inside the build
  sandbox, not the deployed Render URL. — **Reversibility:** reversible — the test script
  itself is target-agnostic (just a base URL parameter); pointing it at the deployed URL
  later is a one-line change if the user wants to re-run it themselves.
- **D-02:** Confirmed by direct connectivity test (`curl` to
  `https://makeitmemetamir.onrender.com/health` timed out, exit 56) that this sandbox has
  no outbound network route to the deployed Render service — same limitation already
  documented for real-device LAN testing in Phase 3/5/6. This is why D-01 was chosen over
  testing the actual production server.

### Test Scale
- **D-03:** Simulate exactly 12 scripted players (the requirement's literal "12+" floor),
  running 1 full round (writing → rating → round-end) end to end. — **Reversibility:**
  reversible — purely a parameter in the test script; the planner/executor may increase
  this if a single round doesn't exercise enough of the round-transition logic to be
  meaningful (see Claude's Discretion below).

### Claude's Discretion
- Exact client implementation (headless `socket.io-client` script vs. Playwright browser
  tabs) is left to the researcher/planner — whichever proves the real client-server
  contract most faithfully with the least new tooling. A raw `socket.io-client` script
  reusing the existing server integration-test patterns (`server/test/*.integration.test.ts`)
  is the likely default given this project's existing test infrastructure.
- Whether 1 round is sufficient to satisfy "completes a full game... without crashing" or
  whether the planner should extend to 2-3 rounds for a more realistic proof of repeated
  round transitions under load is left to planning — the user's explicit choice was the
  literal minimum (12 players, 1 round), but the planner should flag if this leaves an
  obvious gap against the phase's own success criteria.
- Pass/fail thresholds for "no noticeable slowdown" (e.g., a max acceptable latency per
  submission) are not user-specified — the planner should derive a concrete, checkable
  number rather than leaving this subjective.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server config / capacity constants
- `server/src/config.ts` — `ROOM_CAPACITY = 20`, `MIN_PLAYERS_TO_START = 3`,
  `PING_INTERVAL_MS`/`PING_TIMEOUT_MS` (dead-socket detection timing relevant to load
  behavior)

### Existing test infrastructure to reuse
- `server/test/hostActions.integration.test.ts` and other
  `server/test/*.integration.test.ts` files — established real-socket test patterns
  (multi-client setup, `waitFor`/`waitForPhase` helpers) this phase's load-test script
  should follow rather than inventing a new testing approach

### Deployment context (Phase 7)
- `.planning/ROADMAP.md` Phase 7 section — confirms the deployed Render URL
  (`https://makeitmemetamir.onrender.com`) is unreachable from this sandbox; the same
  constraint applies here

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/test/*.integration.test.ts` — real Socket.IO client/server integration test
  harness already exists (multiple simulated players connecting to one in-process server)
  and is the closest existing analog to a 12-player load test; likely the direct basis for
  this phase's test script rather than a new tool.

### Established Patterns
- Server is already proven to support up to `ROOM_CAPACITY = 20` players structurally
  (validated by existing room-join tests) — this phase is about *simultaneous load*
  (12+ concurrent submissions in the same round window), not about whether the room data
  structure itself can hold that many players.

### Integration Points
- The load test needs a running server process (either spawned in-process like the
  existing integration tests, or started via `npm --prefix server run start` and
  connected to over `localhost`) plus N `socket.io-client` connections following the
  existing join → write → rate flow.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the two decisions above — open to standard approaches for
the actual test script implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Load & Capacity Verification*
*Context gathered: 2026-09-08*
