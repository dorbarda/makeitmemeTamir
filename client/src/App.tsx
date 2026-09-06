import { useEffect, useState, type ReactElement } from "react";
import { HEBREW_UI } from "@shared/messages.js";
import { useSnapshot } from "./state/gameStore";
import { useConnected } from "./socket/connection";
import { Home } from "./screens/Home";
import { Join } from "./screens/Join";
import { JoinByCode } from "./screens/JoinByCode";
import { Lobby } from "./screens/Lobby";
import { Round } from "./screens/Round";

function readJoinCode(pathname: string): string | undefined {
  const match = /^\/join\/(\d{4})$/.exec(pathname);
  return match?.[1];
}

/**
 * Plain `window.location.pathname` matching — no router library is worth its
 * weight for three screens (Home, the deep-link Join, and the manual-code
 * JoinByCode fallback) in a one-week build. `navigate` is the one shared
 * primitive every screen uses to move between them without a full page
 * reload, and `popstate` keeps the back button working.
 */
function App() {
  const snapshot = useSnapshot();
  const connected = useConnected();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string, mode: "push" | "replace" = "push"): void {
    if (mode === "push") {
      history.pushState(null, "", path);
    } else {
      history.replaceState(null, "", path);
    }
    setPathname(path);
  }

  // A returning player is a pure function of the snapshot the server sent —
  // no interstitial, no extra tap, regardless of which route they landed on.
  let screen: ReactElement;
  if (snapshot) {
    // The client never decides the phase, it reads it — Room.ts is the sole
    // authority over `snapshot.phase` (D-12).
    screen = snapshot.phase === "LOBBY" ? <Lobby snapshot={snapshot} /> : <Round snapshot={snapshot} />;
  } else {
    const joinCode = readJoinCode(pathname);
    if (joinCode) {
      screen = <Join roomCode={joinCode} />;
    } else if (pathname.replace(/\/+$/, "") === "/join") {
      screen = (
        <JoinByCode
          onJoined={(roomCode) => navigate(`/join/${roomCode}`, "replace")}
        />
      );
    } else {
      screen = <Home onHaveCode={() => navigate("/join")} />;
    }
  }

  return (
    <>
      {screen}
      {/* Overlays, never unmounts, the current screen (D-14) — the roster or
          form underneath stays visible and picks up the incoming snapshot
          the instant the connection returns, with nothing to dismiss. */}
      {!connected && (
        <div className="reconnect-overlay" role="status">
          {HEBREW_UI.reconnecting}
        </div>
      )}
    </>
  );
}

export default App;
