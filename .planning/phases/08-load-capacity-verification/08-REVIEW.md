---
phase: 08-load-capacity-verification
reviewed: 2026-09-10T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - server/test/load.integration.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-09-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `server/test/load.integration.test.ts`, the sole file this phase created: a
tracer test (`MIN_PLAYERS_TO_START` players, 1 round) plus the real 12-player /
3-round capacity proof against a real in-process Socket.IO server. The file is
unusually well-commented, and several of those comments explicitly document a known
event-ordering hazard (registering a fresh one-shot listener *after* the broadcast it
is waiting for may already have fired, in which case it "waits forever"). That
documented hazard is correctly avoided in the tracer and at the last-rating-step →
`ROUND_END` boundary of the load scenario, but the load scenario's own intermediate
rating-step-to-rating-step transitions (`stepIndex` → `stepIndex + 1` inside the main
loop) use the exact pattern the file's own comments warn against, with no
countervailing comment explaining why it is safe there. Cross-referencing
`server/src/config.ts` shows the real pacing constants (`WRITING_COLLAPSE_MS` = 3s,
`RATING_COLLAPSE_MS` = 2s) are generous enough that this is very unlikely to flip a
passing run into a hang under normal conditions, so this is filed as a Warning
(latent flakiness / harness fragility) rather than a Critical finding — but it is a
real, provable inconsistency within the file, not speculation about out-of-scope
server internals.

Two further Warnings and two Info items round out the findings: none of the file's
own local `wait*` helpers implement a timeout (unlike `setup.ts`'s `waitFor`), which
means any real regression this test is designed to catch will surface as an opaque
5-minute Vitest timeout instead of a clear "which broadcast never arrived" error; and
the "no lost submissions" proof is entirely count/aggregate-based (uniform rating
value, no per-entry content/authorship check), which means a class of bugs — cross-step
or cross-player misattribution that preserves totals — would not be caught by this
test despite the test's stated purpose.

## Warnings

### WR-01: Rating-step-to-rating-step transition re-registers a listener after the event it's meant to catch may already have fired

**File:** `server/test/load.integration.test.ts:320-347`

**Issue:** The file itself documents (lines 64-69, 178-190) that a fresh
`waitForRatingStep(c, N)` registered *after* the broadcast for step `N` has already
gone out "would wait forever for an event that will never fire again," and both the
tracer (lines 196-209) and the load scenario's own last-step → `ROUND_END` handoff
(lines 348-372) correctly avoid this by registering the *next* transition's listeners
**before** emitting the action that triggers it.

The intermediate step transitions inside the main rating loop do not follow that same
safe pattern. For `stepIndex < LOAD_TEST_PLAYER_COUNT - 1` (lines 329-347), the code
registers `waitForOwnState` listeners for **the current step's** `youHaveRated` flag,
emits the ratings, awaits those confirmations, and only then — at the *top of the next
loop iteration* (line 322) — registers a fresh `waitForRatingStep(c, stepIndex)` for
the step that has, by then, potentially already opened. This is structurally the same
"register after the fact" shape the file's own comments call unsafe, just with a
`RATING_COLLAPSE_MS`/`BETWEEN_MEMES_MS` pacing gap (2s + 2s per `config.ts`) standing
in for luck instead of `.once`-before-emit ordering.

In practice this gap is generous enough that a hang is unlikely under normal test
execution, which is presumably why it currently passes. But it is an unenforced
timing assumption baked into the harness for exactly the code path (event ordering
under concurrent load) this phase exists to validate — a slower CI runner, GC pause,
or a future tightening of `RATING_COLLAPSE_MS`/`BETWEEN_MEMES_MS` could turn this into
an intermittent false failure (a hang, masked as a generic Vitest timeout — see
WR-02) with no code change to the server at all.

**Fix:** Mirror the tracer's / the `ROUND_END` boundary's own safe pattern: register
`waitForRatingStep(c, stepIndex + 1)` for all clients **before** emitting the ratings
for `stepIndex`, and use those resolved snapshots as the next iteration's
`stepSnapshots` instead of re-deriving them at the top of the loop. For example:

```javascript
// before emitting ratings for stepIndex:
const nextStepWaiters = allClients.map((c) => waitForRatingStep(c, stepIndex + 1));
raters.forEach((rater) => {
  rater.emit(CLIENT_EVENTS.submitRating, { stepIndex, value: LOAD_TEST_RATING_VALUE });
});
const nextStepSnapshots = await Promise.all(nextStepWaiters);
// use nextStepSnapshots directly as next iteration's stepSnapshots
```

### WR-02: Local `wait*` helpers have no timeout, unlike `setup.ts`'s `waitFor`

**File:** `server/test/load.integration.test.ts:29-83`

**Issue:** `waitForPhase`, `waitForRatingStep`, and `waitForOwnState` (all three
locally defined in this file) each return a bare `new Promise((resolve) => { ... })`
with no `setTimeout`/reject path — unlike `server/test/setup.ts`'s `waitFor`, which
rejects after 5000ms with a message naming the event it was waiting for. If any one
of these three helpers' expected broadcast never arrives (the exact failure mode a
capacity/load test is meant to surface — a lost or dropped state broadcast under
concurrent load), the promise never settles, and the only thing that eventually fails
the test is Vitest's blunt per-`it` timeout (30000ms for the tracer, 300000ms for the
load scenario). That failure message will say "test timed out after N ms" with no
indication of which of the dozens of `wait*` calls in the test body never resolved,
making a real regression significantly harder to diagnose than it needs to be.

**Fix:** Give each helper the same reject-with-context behavior as `setup.ts`'s
`waitFor`:

```javascript
function waitForRatingStep(socket, index, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SERVER_EVENTS.state, onState);
      reject(new Error(`waitForRatingStep timed out waiting for ratingStep.index === ${index}`));
    }, timeoutMs);
    const onState = (snapshot) => {
      if (snapshot.phase === "RATING" && snapshot.ratingStep?.index === index) {
        clearTimeout(timer);
        socket.off(SERVER_EVENTS.state, onState);
        resolve(snapshot);
      }
    };
    socket.on(SERVER_EVENTS.state, onState);
  });
}
```

(Same shape for `waitForPhase` and `waitForOwnState`.)

### WR-03: "No lost submissions" is proven only by aggregate counts/scores, not per-entry content or attribution — and the uniform rating value hides misattribution

**File:** `server/test/load.integration.test.ts:15-18, 373-378, 397-406`

**Issue:** The round-end and game-end assertions (`entry.ratings.length`,
`entry.eligibleAtClose`, `entry.score`, `player.score`) are all aggregate counts and
sums, never a check that a specific player's *own* submitted caption text (from
`fakeMeme(...)`) or a specific rater's identity ended up attached to the correct
entry. Combined with `LOAD_TEST_RATING_VALUE` being the same constant (`2`) for
*every* rater on *every* step (deliberately, per the comment at lines 15-18, "so the
final score is fully deterministic"), this design has a real blind spot: a bug that
swaps a rating between two rating steps, or attributes a rating to the wrong entry
(a plausible class of bug under concurrent load — the exact scenario this phase
exists to stress), would not change any of `entry.ratings.length`,
`entry.eligibleAtClose`, `entry.score`, or `player.score`, because every rater always
contributes the identical value regardless of which entry it lands on. The test can
therefore prove "nothing was lost or double-counted in aggregate" but cannot prove
"every submission was correctly attributed to its author/step," despite that being
part of what LIVE-01/DEPLOY-04 imply by "no lost submissions."

**Fix:** Add at least one content/identity-level check per round — e.g. assert that
`roundEnd.entries` contains exactly one entry per submitting player (by player id) and
that each entry's meme/caption matches what that specific player submitted
(`fakeMeme(`p${i}`)`'s deterministic output), not just that the counts line up.
Alternatively, vary `LOAD_TEST_RATING_VALUE` per rater (e.g. rater index + 1) so a
cross-step/cross-entry misattribution would change the aggregate score and be caught
by the existing assertions without adding new ones.

## Info

### IN-01: `Math.max(...latencies)` passes vacuously if `latencies` is ever empty

**File:** `server/test/load.integration.test.ts:411`

**Issue:** `Math.max(...[])` evaluates to `-Infinity` in JavaScript, which is always
`< LOAD_TEST_MAX_LATENCY_MS`. In the current code `latencies` is always populated
(pushed once per caption submission and once per rating submission across 3 rounds ×
12 steps), so this isn't reachable today — but there is no explicit guard, so a future
refactor that accidentally short-circuits the `latencies.push` calls (e.g. an early
`return` inside one of the `.then()` callbacks) would make the sole latency assertion
silently pass instead of failing loudly.

**Fix:** Add a sanity assertion before the threshold check:

```javascript
expect(latencies.length).toBeGreaterThan(0);
expect(Math.max(...latencies)).toBeLessThan(LOAD_TEST_MAX_LATENCY_MS);
```

### IN-02: No cleanup of open sockets if an assertion throws mid-test

**File:** `server/test/load.integration.test.ts:250-428`

**Issue:** `allClients.forEach((s) => s.close())` only runs if every prior `expect(...)`
in the `it` block passes. If any assertion throws partway through the 12-player,
3-round run, the 12 client sockets are left open until the describe block's
`afterAll` closes the whole server (which will force-close them, but leaves a longer
window of open connections/listeners during whatever else runs in the same Vitest
worker before that `afterAll` fires). This is minor given the server is torn down
regardless, but is worth a `try { ... } finally { allClients.forEach((s) => s.close()); }`
for a cleaner failure mode, consistent with generally not leaving sockets dangling
after a failed assertion.

**Fix:**

```javascript
try {
  // ... existing test body ...
} finally {
  allClients.forEach((s) => s.close());
}
```

---

_Reviewed: 2026-09-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
