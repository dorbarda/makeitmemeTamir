import { useEffect, useState } from "react";
import { useSnapshot } from "./state/gameStore";
import { Home } from "./screens/Home";
import { Join } from "./screens/Join";
import { JoinByCode } from "./screens/JoinByCode";
import { Lobby } from "./screens/Lobby";

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
  if (snapshot) {
    return <Lobby snapshot={snapshot} />;
  }

  const joinCode = readJoinCode(pathname);
  if (joinCode) {
    return <Join roomCode={joinCode} />;
  }

  if (pathname.replace(/\/+$/, "") === "/join") {
    return (
      <JoinByCode
        onJoined={(roomCode) => navigate(`/join/${roomCode}`, "replace")}
      />
    );
  }

  return <Home onHaveCode={() => navigate("/join")} />;
}

export default App;
