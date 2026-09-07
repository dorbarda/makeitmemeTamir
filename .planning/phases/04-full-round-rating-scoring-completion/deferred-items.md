# Deferred Items — Phase 04

Out-of-scope discoveries logged during plan execution (SCOPE BOUNDARY rule).
Not fixed here — listed for awareness only.

## 04-01

- **test/qrJoinUrl.test.ts** — `GET /join/:code serves the SPA shell, never a 404 > returns 200
  and HTML for a cold request to /join/4827` fails with 404 instead of 200 whenever `client/dist`
  has not been built (`npm --prefix client run build` was never run in this environment). This is
  pre-existing and unrelated to 04-01's files (photoPool.ts, the 20 placeholder photos, the
  generator script) — it depends on the client build artifact existing, which this plan does not
  touch. Building the client before running the full server test suite resolves it locally; no
  code change needed.
