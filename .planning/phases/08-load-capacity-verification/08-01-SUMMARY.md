---
phase: 08-load-capacity-verification
plan: 01
subsystem: testing
tags: [socket.io, vitest, integration-test, load-test, capacity]

# Dependency graph
requires:
  - phase: 02-multiplayer-round-engine
    provides: Room.ts round/rating state machine and the socket handler wiring this test exercises
  - phase: 07-deployment
    provides: confirmation the deployed Render URL is unreachable from this sandbox (D-01/D-02), motivating the local-only test target
provides:
  - "server/test/load.integration.test.ts — a real-socket, in-process 12-player/3-round capacity proof"
  - "A documented, checkable 500ms per-submission latency threshold (replacing the prior subjective 'no noticeable slowdown')"
affects: [09-real-phone-rehearsal]

# Actuals (#2632)
actuals:
  tokens: 4926
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "waitForOwnState(socket, predicate) — a predicate-based, persistent (non-once) state-wait helper for disambiguating a socket's OWN confirmation from other clients' concurrent broadcasts during a many-way submission burst"
    - "Never re-register a fresh waitForRatingStep(socket, N) for a step whose opening broadcast was already consumed by a prior await in the same test — carry the already-resolved snapshot forward into the next loop iteration instead"

key-files:
  created:
    - server/test/load.integration.test.ts
  modified: []

key-decisions:
  - "Extended CONTEXT.md's D-03 literal '1 round' to the room's true DEFAULT_ROUND_COUNT (3 rounds), per the plan's own resolution of CONTEXT.md's flagged round-transition gap — a real host could never even pick 1 round (ROUND_COUNT_PRESETS has no preset of 1)."
  - "Set the load test's latency threshold at 500ms, generous for a same-process loopback round trip, resolving CONTEXT.md's Claude's Discretion item on making 'no noticeable slowdown' checkable rather than subjective."
  - "Fixed two latent event-ordering races discovered while executing the plan (both auto-fixed under deviation Rule 1 — see Deviations below) rather than deviating from the plan's tested-safe waitForRatingStep/waitFor patterns."

patterns-established:
  - "Pattern: a bare `waitFor()` (`.once()`) is only safe when the registering socket has zero un-awaited state broadcasts pending — every join/submission that broadcasts to MULTIPLE sockets must have ALL of those sockets' resulting state events awaited (or use a persistent predicate-based waiter like waitForRatingStep/waitForOwnState) before any of those sockets gets a fresh `.once()` listener."

requirements-completed: [DEPLOY-04, LIVE-01]

coverage:
  - id: D1
    description: "A scripted 12-concurrent-player, 3-round game completes over real sockets against a locally started in-process server with zero lost captions/ratings, every confirmation latency under 500ms, and the same server process proven to survive without a restart"
    requirement: "LIVE-01"
    verification:
      - kind: integration
        ref: "server/test/load.integration.test.ts#12 concurrent players complete a full 3-round game with zero lost submissions, sub-500ms latency, and the server stays up for a brand-new room afterward"
        status: pass
    human_judgment: false
  - id: D2
    description: "A minimal 3-player, 1-round tracer proves the load-test harness (join, write, meme-by-meme rating, GAME_END) is wired correctly over real sockets before scaling to the full load scenario"
    requirement: "DEPLOY-04"
    verification:
      - kind: integration
        ref: "server/test/load.integration.test.ts#MIN_PLAYERS_TO_START scripted players join, write, rate meme-by-meme, and reach GAME_END"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-09-10
status: complete
---

# Phase 8 Plan 1: Load & Capacity Verification Summary

**A real-socket vitest integration test (`server/test/load.integration.test.ts`) proving 12 concurrently-connected scripted clients complete a full 3-round game against a locally started in-process server with zero lost submissions, every confirmation under a documented 500ms latency threshold, and the same server process surviving to serve a brand-new room with no restart.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-10T13:57:15Z (phase execution start, per STATE.md)
- **Completed:** 2026-09-10T14:19:48Z
- **Tasks:** 2
- **Files modified:** 1 (new file)

## Accomplishments

- Tracer (Task 1): a minimal 3-player, 1-round game proves the harness — join, write, meme-by-meme rating rotation, GAME_END — is wired correctly over real Socket.IO sockets before scaling up.
- Real capacity proof (Task 2): 12 concurrently-connected scripted clients (11 joiners connected/joined via `Promise.all`, not sequentially) complete a full 3-round game (`DEFAULT_ROUND_COUNT`, the room's true unmodified default settings — no `writingSeconds`/`ratingSeconds`/`rounds` seeding anywhere in this task) with:
  - Zero lost submissions, verified three independent ways per round: the host's own `progress.submitted === 12` resync check, every `ROUND_END` entry's `ratings.length === 11`/`eligibleAtClose === 11`, and a fully deterministic `score === 22` per entry (every rater casting the same value).
  - Every one of the 36 caption and 396 rating round-trip confirmations measured and asserted under a documented, explicit 500ms latency threshold (`LOAD_TEST_MAX_LATENCY_MS`), resolving CONTEXT.md's "no noticeable slowdown" discretion item into a checkable number.
  - A fully deterministic tied final score (`expectedScorePerPlayer` computed from the same three constants, never hardcoded) and `gameEnd.winners.length === 12`.
  - A post-load sanity check: after all 12 sockets close, a brand-new client connects to the SAME server process and successfully creates a new room — concrete proof the server needs no restart after the load.

## Task Commits

Each task was committed as a single artifact (both tasks build the same new test file incrementally, so the plan's own "Artifacts this phase produces" section — one new file, no production code touched — is delivered in one commit):

1. **Task 1 + Task 2: `server/test/load.integration.test.ts`** — `d5ab020` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `server/test/load.integration.test.ts` - Tracer (3-player/1-round) + real capacity proof (12-player/3-round) integration test, proving DEPLOY-04 and LIVE-01

## Decisions Made

- Extended the round count from D-03's literal "1 round" to the room's real `DEFAULT_ROUND_COUNT` (3), per the plan's own resolution of CONTEXT.md's flagged gap that a single round never exercises a real round-transition under load, and 1 round isn't even a value a real host could pick (`ROUND_COUNT_PRESETS = [3, 5, 7]`).
- Set the documented latency threshold at 500ms — a generous ceiling for a same-process, loopback, ephemeral-port round trip, excluding the product's own intentional pacing beats (`WRITING_COLLAPSE_MS`/`RATING_COLLAPSE_MS`/`BETWEEN_PHASES_MS`/`BETWEEN_MEMES_MS`) from the measured figure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a socket-listener race in the tracer's join sequence**
- **Found during:** Task 1 (tracer) — first test run failed with `expected 'LOBBY' to be 'WRITING'`
- **Issue:** The plan's own pattern (and this file's first draft) awaited only the JOINING client's own `state` confirmation on each join, not the already-connected clients' (host's/prior joiners') resulting broadcast. Because every join broadcasts an updated roster to EVERYONE in the room, a stray un-awaited `LOBBY`-phase broadcast could still be in flight to the host when a later `.once()` listener (registered just before `start-game`) was set up — and that listener would then wrongly consume the stale message instead of the real post-`start-game` `WRITING` broadcast.
- **Fix:** Every join in the tracer now awaits ALL already-connected clients' state broadcasts alongside the joiner's own (mirroring `fullLoop.integration.test.ts`'s own established join pattern, which already does this), draining every socket's event queue before any later `.once()` listener is registered.
- **Files modified:** `server/test/load.integration.test.ts`
- **Verification:** Re-ran `npm --prefix server run test -- --run test/load.integration.test.ts`; the join-phase assertion now passes.
- **Committed in:** `d5ab020` (single commit for the whole file)

**2. [Rule 1 - Bug] Fixed a duplicate rating-step wait causing an indefinite hang**
- **Found during:** Task 1 (tracer) — second test run timed out at 30s waiting on rating step 1
- **Issue:** The tracer's rating loop re-registered a fresh `waitForRatingStep(client, stepIndex)` at the TOP of every loop iteration, including for steps whose opening broadcast had ALREADY been consumed by the PREVIOUS iteration's own `nextStepWaiters` wait. Since that broadcast had already fired and been observed, the fresh listener would wait forever for an event that would never occur again — a genuine deadlock, not a slow test.
- **Fix:** Restructured the loop to carry the already-resolved step snapshots forward from each iteration's `nextStepWaiters` result into the next iteration, only fetching a fresh `waitForRatingStep` for step 0 (before the loop starts). Verified Task 2's analogous loop does NOT have this bug — its "current step" wait is always for a step that has not yet opened, since Task 2's per-rater confirmation waits on a *different* predicate (`youHaveRated === true` for the CURRENT step, not the next step opening).
- **Files modified:** `server/test/load.integration.test.ts`
- **Verification:** Full test file re-run twice consecutively; both the tracer (~6s runtime) and the 12-player/3-round scenario (~166-186s runtime) pass reliably.
- **Committed in:** `d5ab020` (single commit for the whole file)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the test harness itself, discovered and fixed during execution, not present in production code).
**Impact on plan:** Both fixes were necessary for the test to actually prove what it claims; without them the tracer either asserted a false failure or hung indefinitely. No scope creep — both fixes stayed entirely inside the one new test file the plan specified, and no production code (`Room.ts`, `config.ts`, `protocol.ts`, socket handlers) was touched.

## Issues Encountered

- **Environment setup:** `server/node_modules` was not installed at session start (fresh checkout), so `npm --prefix server run typecheck` initially failed with "Cannot find module 'vitest'" across every existing test file (not specific to this plan's new file). Ran `npm --prefix server install --include=dev` to install dependencies; typecheck and tests then ran cleanly. This regenerated a cosmetic normalization diff in `server/package-lock.json` (moving `tsx` from `devDependencies` to `dependencies` to match `package.json`, dropping stale `"dev": true` flags) — reverted via `git checkout -- server/package-lock.json` before committing, since it was an environment-setup side effect unrelated to this plan's scope, not a real dependency change.
- **Pre-existing, out-of-scope test failure:** `npm --prefix server run test -- --run` (full suite) reports 222 passed / 1 failed. The 1 failure is `test/qrJoinUrl.test.ts > GET /join/:code serves the SPA shell, never a 404`, which expects a 200 response from a built `client/dist/index.html` — `client/dist` does not exist in this sandbox because the client has never been built here. This is unrelated to `server/test/load.integration.test.ts` (confirmed: the failure is present regardless of this plan's changes, caused entirely by the missing client build artifact) and out of this plan's scope per the deviation rules' scope boundary (only auto-fix issues directly caused by the current task's changes). Logged here rather than fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEPLOY-04 and LIVE-01 are both fully satisfied: `server/test/load.integration.test.ts` is a permanent, re-runnable proof that the server holds a full 12-player, 3-round game without crashing, hanging, losing a submission, or requiring a restart, with every latency claim backed by a concrete 500ms assertion rather than left subjective.
- This phase's own scope (a scripted load test) is complete; Phase 9 (real-phone rehearsal, DEPLOY-03) is the next natural step, and can reuse this phase's evidence that the underlying server architecture already handles the concurrency load a real 12-15-person party would produce — remaining phase 9 risk is device/network-specific (real phones, real WiFi), not server capacity.
- Minor pre-existing gap (unrelated to this plan, noted above): `client/dist` is not built in this sandbox, so `qrJoinUrl.test.ts`'s SPA-shell-serving test fails here; this is an environment artifact, not a code defect, and does not block this phase's DEPLOY-04/LIVE-01 closure.

---
*Phase: 08-load-capacity-verification*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: server/test/load.integration.test.ts
- FOUND: .planning/phases/08-load-capacity-verification/08-01-SUMMARY.md
- FOUND: commit d5ab020
