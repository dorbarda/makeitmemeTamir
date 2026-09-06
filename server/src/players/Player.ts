export type Player = {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  score: number;
  /**
   * A monotonically increasing join sequence, not a wall-clock timestamp —
   * used only to pick a deterministic host-transfer successor (the
   * earliest-joined connected player). A plain counter avoids coupling host
   * succession to `Date.now()`, which vitest's fake timers also control, so
   * two players added within the same fake-timer tick would otherwise tie.
   */
  joinedAt: number;
};
