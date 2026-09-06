import { useEffect, useState } from "react";
import { HEBREW_UI } from "@shared/messages.js";
import { isUrgent, remainingMs, remainingSeconds, skewOffsetMs } from "../time/countdown";

type CountdownProps = {
  deadlineAt: number | null;
  serverNow: number;
};

/**
 * The only thing counting down — the server sends no per-second message
 * (D-12). Renders nothing when there is no live deadline (LOBBY, GAME_END).
 * Ticks locally every 250ms against a skew offset computed once per
 * snapshot, so a reconnecting or backgrounded phone always lands on the
 * correct remaining time as soon as a fresh snapshot arrives.
 */
export function Countdown({ deadlineAt, serverNow }: CountdownProps) {
  const [offsetMs, setOffsetMs] = useState(() => skewOffsetMs(serverNow, Date.now()));
  const [now, setNow] = useState(() => Date.now());

  // Recompute the skew offset whenever a fresh serverNow arrives (a new
  // snapshot), not on every tick.
  useEffect(() => {
    setOffsetMs(skewOffsetMs(serverNow, Date.now()));
  }, [serverNow]);

  useEffect(() => {
    if (deadlineAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [deadlineAt]);

  if (deadlineAt === null) return null;

  const seconds = remainingSeconds(deadlineAt, now, offsetMs);
  const urgent = isUrgent(remainingMs(deadlineAt, now, offsetMs));

  return (
    <p className={urgent ? "countdown countdown--urgent" : "countdown"} role="timer">
      {HEBREW_UI.timeLeftLabel}: {seconds}
    </p>
  );
}
