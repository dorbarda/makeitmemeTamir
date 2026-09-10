import { useEffect, useRef } from "react";

// A purely decorative, DVD-screensaver-style bouncing hero photo, rendered
// exclusively on the Lobby screen (see Lobby.tsx). Position/velocity live in
// a mutable ref rather than React state so the animation never triggers a
// re-render — the same `window.`-prefixed cleanup pattern Countdown.tsx uses
// for its interval, applied here to requestAnimationFrame instead.

const LOGO_SIZE = 64; // px — matches the CSS rule's 4rem at the root 16px font-size
const SPEED = 90; // px/second

export function BouncingLogo() {
  const imgRef = useRef<HTMLImageElement>(null);
  const stateRef = useRef({ x: 0, y: 0, vx: SPEED, vy: SPEED, last: 0 });

  useEffect(() => {
    if (!imgRef.current) return;

    const state = stateRef.current;
    state.x = Math.random() * Math.max(0, window.innerWidth - LOGO_SIZE);
    state.y = Math.random() * Math.max(0, window.innerHeight - LOGO_SIZE);
    state.last = performance.now();

    let frameId: number;

    function tick(now: number) {
      const dt = Math.min((now - state.last) / 1000, 0.1);
      state.last = now;

      const maxX = window.innerWidth - LOGO_SIZE;
      const maxY = window.innerHeight - LOGO_SIZE;

      state.x += state.vx * dt;
      state.y += state.vy * dt;

      if (state.x <= 0) {
        state.x = 0;
        state.vx = Math.abs(state.vx);
      } else if (state.x >= maxX) {
        state.x = maxX;
        state.vx = -Math.abs(state.vx);
      }

      if (state.y <= 0) {
        state.y = 0;
        state.vy = Math.abs(state.vy);
      } else if (state.y >= maxY) {
        state.y = maxY;
        state.vy = -Math.abs(state.vy);
      }

      const el = imgRef.current;
      if (el) {
        el.style.transform = `translate(${state.x}px, ${state.y}px)`;
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <img
      ref={imgRef}
      className="bouncing-logo"
      src="/branding/dvd-bounce.jpeg"
      alt=""
      aria-hidden="true"
    />
  );
}
