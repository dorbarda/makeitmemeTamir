// D-15: the countdown becomes visually urgent in the last 10 seconds. A
// client-only display rule, so it lives here with the display code rather
// than in the server's config (the server never sends per-second messages —
// D-12 — this constant only governs local rendering).
export const COUNTDOWN_URGENT_MS = 10_000;

/**
 * The correction between the server's clock and this device's clock, from
 * one matched pair of (serverNow, clientNow) taken from the same snapshot.
 * A client whose own clock reads 30s fast yields -30000: subtracting that
 * offset later cancels the client's own drift.
 */
export function skewOffsetMs(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/**
 * Milliseconds remaining until `deadlineAt`, computed against a skew-
 * corrected local clock. Clamped at 0 — a countdown never reads negative,
 * however far past the deadline the caller asks.
 */
export function remainingMs(deadlineAt: number, clientNow: number, offsetMs: number): number {
  return Math.max(0, deadlineAt - (clientNow + offsetMs));
}

/**
 * Whole seconds remaining, rounded up so the display never flashes "0" a
 * moment before the deadline actually passes (1 ms left still reads as 1,
 * exactly 1000 ms reads as 1, 1001 ms reads as 2).
 */
export function remainingSeconds(deadlineAt: number, clientNow: number, offsetMs: number): number {
  return Math.ceil(remainingMs(deadlineAt, clientNow, offsetMs) / 1000);
}

/** True only in the final COUNTDOWN_URGENT_MS before the deadline — never
 * true once the deadline has actually passed (remainingMs === 0). */
export function isUrgent(remainingMsValue: number): boolean {
  return remainingMsValue > 0 && remainingMsValue <= COUNTDOWN_URGENT_MS;
}
