import { afterEach, describe, expect, it } from "vitest";
import { SESSION_STORAGE_KEY, clearToken, readToken, writeToken } from "./sessionStore";

describe("sessionStore", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a token through localStorage", () => {
    expect(readToken()).toBeUndefined();
    writeToken("abc-123");
    expect(readToken()).toBe("abc-123");
    clearToken();
    expect(readToken()).toBeUndefined();
  });

  it("writes exactly one key to localStorage", () => {
    writeToken("only-one-key");
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(SESSION_STORAGE_KEY);
  });
});
