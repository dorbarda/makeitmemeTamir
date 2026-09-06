---
phase: "1"
slug: "room-session-reconnect-foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-05"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 — one framework for both client and server (both are Vite-based) |
| **Config file** | none yet — Wave 0 installs (greenfield repo) |
| **Quick run command** | `npm run test -- --run <file>` (per package) |
| **Full suite command** | `npm run test -- --run` (per package) |
| **Estimated runtime** | ~30 seconds (single file) / ~60 seconds (full server suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run <changed test file>`
- **After every plan wave:** Run `npm run test -- --run` (server package)
- **Before `/gsd-verify-work`:** Full suite must be green **plus** the manual real-phone lock/unlock check
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. Rows below are the requirement-level map from
> RESEARCH.md; the planner binds each to a task ID.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LOBBY-01 | — | Room code is server-generated, never client-supplied | unit | `npx vitest run server/test/roomManager.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-01 | — | Code collision retried, never duplicated while active | unit | `npx vitest run server/test/roomManager.test.ts -t "collision"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-02 | — | QR encodes the same join URL as the link path | unit | `npx vitest run server/test/qrJoinUrl.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-03 | — | Join requires code + name only; no credential fields | integration | `npx vitest run server/test/join.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-04 (D-07) | — | Duplicate name auto-suffixes, never rejects | unit | `npx vitest run server/test/nameDedup.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-04 (D-08) | — | Name truncated by grapheme cluster, never mid-emoji | unit | `npx vitest run server/test/nameValidation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-04 (D-09) | — | Lobby rename re-runs de-dup; locks once game starts | unit | `npx vitest run server/test/rename.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-03 (D-05) | — | 21st player gets a clear Hebrew capacity message | integration | `npx vitest run server/test/capacity.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-05 (D-11) | — | `canStart` true only at ≥3 players | unit | `npx vitest run server/test/canStart.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LOBBY-05 | — | Join/leave broadcasts a full roster snapshot to the room | integration | `npx vitest run server/test/roster.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIVE-02 | — | Same token restores same player; no duplicate record | integration | `npx vitest run server/test/reconnect.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIVE-02 | — | Unknown/expired token issues a fresh session, no crash | integration | `npx vitest run server/test/reconnectUnknownToken.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIVE-02 (D-13) | — | Disconnected player stays in roster until grace elapses | integration (fake timers) | `npx vitest run server/test/rosterFade.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIVE-02 (D-16) | — | Host flag transfers after grace delay on host disconnect | integration (fake timers) | `npx vitest run server/test/hostTransfer.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/vitest.config.ts` — no test config exists yet (greenfield repo)
- [ ] `server/test/setup.ts` — helper to spin up an in-process HTTP + Socket.IO server on an ephemeral port and tear it down per test, plus a helper to create connected `socket.io-client` instances against it
- [ ] `npm install -D vitest` in the server package — no framework installed yet
- [ ] `client/vitest.config.ts` — for the client-side name-length pre-check and localStorage session read/write (recommended: D-08's emoji-truncation risk exists client-side too)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phone lock/unlock mid-lobby | LIVE-02 | No automated harness reproduces iOS's OS-level tab suspension | Join the lobby on a real iPhone, lock the phone for 30–60s, unlock, confirm the same name and roster position return with no duplicate entry |
| WhatsApp link first-tap join | LOBBY-03 (D-02/D-03) | In-app browser hand-off behaviour cannot be simulated | Paste the join link into a WhatsApp chat, tap it on a real phone, confirm it lands on the name-entry screen with the room code pre-filled |
| Hebrew RTL name entry | LOBBY-04 | Real mobile keyboard behaviour | Type a Hebrew name plus an emoji on a real iPhone and a real Android keyboard; confirm it renders and stores correctly |
| Grace-delay tuning (D-13/D-16) | LIVE-02 | RESEARCH.md flags the derived numbers `[ASSUMED]` | Measure real reconnect timing on a phone; confirm or correct the roster-fade and host-transfer delays before the phase closes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
