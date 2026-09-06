export const SESSION_STORAGE_KEY = "tamir-meme:session";

// A browser with storage disabled (private mode, some in-app WebViews) throws
// on any localStorage access, not just on write — degrade to an in-memory
// fallback instead of crashing the whole app.
let memoryFallback: string | undefined;

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readToken(): string | undefined {
  if (!storageAvailable()) return memoryFallback;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY) ?? undefined;
  } catch {
    return memoryFallback;
  }
}

export function writeToken(token: string): void {
  memoryFallback = token;
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Storage disabled — memoryFallback already holds the token for this session.
  }
}

export function clearToken(): void {
  memoryFallback = undefined;
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage disabled — nothing to clear.
  }
}
