---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-09-07T10:59:45.122Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | server/src/config.ts |  | Task 3's real-phone human-check (lock 10s/30s/45s, WiFi-off fade, host-phone-off transfer, force-quit reopen) not run in this sandboxed session — no physical phones available; ROSTER_FADE_GRACE_MS/HOST_TRANSFER_GRACE_MS kept at reasoned 30s/60s pending that stopwatch confirmation. | open |  | 2026-09-06T10:35:15.923Z |  |
| 2 | 01 | todo | server/src/rooms/Room.ts |  | Room.dispose() clears every pending fade/host-transfer timer but has no production call site yet — RoomManager never tears down a room (rooms live for the process lifetime by design, per RESEARCH.md A4). Exercised directly by rosterFade/hostTransfer tests only; wire a real call site once a later phase adds room-lifecycle teardown. | open |  | 2026-09-06T10:35:26.742Z |  |
| 3 | 04 | deviation | test/qrJoinUrl.test.ts |  | Pre-existing failure (unrelated to 04-01): GET /join/:code test fails 404 when client/dist has not been built; needs client build before running full server suite | open |  | 2026-09-07T10:59:45.122Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "server/src/config.ts",
    "line": null,
    "description": "Task 3's real-phone human-check (lock 10s/30s/45s, WiFi-off fade, host-phone-off transfer, force-quit reopen) not run in this sandboxed session — no physical phones available; ROSTER_FADE_GRACE_MS/HOST_TRANSFER_GRACE_MS kept at reasoned 30s/60s pending that stopwatch confirmation.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T10:35:15.923Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "todo",
    "phase": "01",
    "file": "server/src/rooms/Room.ts",
    "line": null,
    "description": "Room.dispose() clears every pending fade/host-transfer timer but has no production call site yet — RoomManager never tears down a room (rooms live for the process lifetime by design, per RESEARCH.md A4). Exercised directly by rosterFade/hostTransfer tests only; wire a real call site once a later phase adds room-lifecycle teardown.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T10:35:26.742Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "04",
    "file": "test/qrJoinUrl.test.ts",
    "line": null,
    "description": "Pre-existing failure (unrelated to 04-01): GET /join/:code test fails 404 when client/dist has not been built; needs client build before running full server suite",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-07T10:59:45.122Z",
    "resolved_at": null
  }
]
````
