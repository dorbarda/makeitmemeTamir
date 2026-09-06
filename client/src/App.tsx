import { useSnapshot } from "./state/gameStore";
import { Home } from "./screens/Home";
import { Join } from "./screens/Join";
import { Lobby } from "./screens/Lobby";

function readJoinCode(): string | undefined {
  const match = /^\/join\/(\d{4})$/.exec(window.location.pathname);
  return match?.[1];
}

function App() {
  const snapshot = useSnapshot();

  // A returning player is a pure function of the snapshot the server sent —
  // no interstitial, no extra tap, regardless of which route they landed on.
  if (snapshot) {
    return <Lobby snapshot={snapshot} />;
  }

  const joinCode = readJoinCode();
  if (joinCode) {
    return <Join roomCode={joinCode} />;
  }

  return <Home />;
}

export default App;
