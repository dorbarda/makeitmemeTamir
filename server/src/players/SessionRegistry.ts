import { randomUUID } from "node:crypto";

export type SessionBinding = { roomCode: string; playerId: string };

/**
 * The only place a token becomes an identity. No other module may read
 * `auth.token` directly — everything routes through issue()/bind()/resolve().
 */
export class SessionRegistry {
  private tokens = new Map<string, SessionBinding>();

  issue(): string {
    return randomUUID();
  }

  bind(token: string, roomCode: string, playerId: string): void {
    this.tokens.set(token, { roomCode, playerId });
  }

  resolve(token: string | undefined): SessionBinding | undefined {
    if (!token) return undefined;
    return this.tokens.get(token);
  }
}
