// LOBBY and GAME_END are terminal — no phase timer, no deadline. WRITING,
// REVEAL_BREAK, RATING and ROUND_END are the "live" phases: each of them
// always carries a non-null deadlineAt in the snapshot (LIVE-03) and the
// server alone owns the timer that ends it (D-12).
export type RoomPhase =
  | "LOBBY"
  | "WRITING"
  | "REVEAL_BREAK"
  | "RATING"
  | "ROUND_END"
  | "GAME_END";

export type PlayerView = {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
};

// D-01/D-02 — the three host-tunable settings, always one of a fixed preset
// array, never free text.
export type SettingKey = "rounds" | "writingSeconds" | "ratingSeconds";
export type GameSettings = {
  rounds: number;
  writingSeconds: number;
  ratingSeconds: number;
};
export type SettingsOptions = Record<SettingKey, number[]>;

/** 1-based `index` — "round 1 of 3", never "round 0 of 3". */
export type RoundView = { index: number; total: number };

// D-13 — a bare count plus per-player submitted-or-not, never any caption
// text (D-14).
export type SubmissionProgress = {
  submitted: number;
  total: number;
  submittedPlayerIds: string[];
};

export type RatingValue = 1 | 2 | 3;

/**
 * The current meme on screen during RATING. Deliberately carries no author
 * identity for anyone but the author themself (`youAreAuthor` is the only
 * identity signal this view exposes) — D-14's "nothing to leak" rule extends
 * to who wrote a caption, not just its text, until the round-end reveal.
 */
export type RatingStepView = {
  index: number;
  total: number;
  meme: string; // base64-encoded PNG (RESEARCH.md rasterize-and-transmit) — replaces caption+photoUrl
  youAreAuthor: boolean;
  youMayRate: boolean;
  youHaveRated: boolean;
  ratedCount: number;
  eligibleCount: number;
};

/**
 * `ratings` and `eligibleAtClose` are the data D-10 requires Phase 4 to have
 * to decide sum-vs-average scoring (or some floor) without a rework — a meme
 * rated while some eligible raters were away must be distinguishable from
 * one everyone rated.
 */
export type RoundEndEntry = {
  authorId: string;
  authorName: string;
  meme: string;
  ratings: RatingValue[];
  eligibleAtClose: number;
  // VOTE-06 (plan 04-01) — the server-computed sum of `ratings`, added once
  // inside buildRoundEndView and never re-derived client-side.
  score: number;
};

export type RoundEndView = {
  entries: RoundEndEntry[];
  // LIVE-04/D-01 — true only for the one ROUND_END window immediately
  // following a host skip-round; cleared before the next round opens (or at
  // GAME_END, whichever comes first). A host-skipped round's entries are
  // always empty, but this flag is what lets the client show "the host
  // skipped this round" instead of the unrelated too-few-captions message.
  skippedByHost: boolean;
};

/**
 * One meme in the "best of the night" list (MEME-02/D-04). Carries
 * everything the client needs to render one entry without a second lookup —
 * `Room.bestOfNight` is the running top-3 this type describes, tracked
 * incrementally round by round, never recomputed by scanning history.
 */
export type BestOfEntry = {
  authorId: string;
  authorName: string;
  meme: string;
  score: number;
};

/**
 * The GAME_END-only view (plan 04-02): `winners` is every player tied for
 * the single highest score, never just one on a tie (SCORE-04/D-03);
 * `bestOfNight` is the real top-3 highest-scoring memes across the whole
 * game (MEME-02/D-04).
 */
export type GameEndView = { winners: PlayerView[]; bestOfNight: BestOfEntry[] };

export type LobbySnapshot = {
  phase: RoomPhase;
  roomCode: string;
  joinUrl: string; // filled by plan 01-03; "" until then
  qrDataUrl: string; // filled by plan 01-03; "" until then
  players: PlayerView[];
  readyCount: number; // connected players
  capacity: number;
  canStart: boolean;
  you: { id: string; isHost: boolean };
  settings: GameSettings;
  settingsOptions: SettingsOptions;
  settingsLocked: boolean; // D-05 — true from the moment the game starts
  serverNow: number; // the client's clock-skew reference for deadlineAt
  // D-12 — an absolute epoch-ms deadline, never a "seconds remaining"
  // countdown value; the server never ticks. Null only in LOBBY/GAME_END.
  deadlineAt: number | null;
  round: RoundView | null; // null only in LOBBY
  progress: SubmissionProgress | null; // filled by plan 02-03
  youSubmitted: boolean; // filled by plan 02-03
  yourPhotoUrl: string | null; // filled by plan 03-01 — this player's own assigned photo (D-01)
  // ROUND-06/D-01/D-02 (plan 04-01) — true only during WRITING, before this
  // player has submitted or already used this round's one swap.
  youCanSwapPhoto: boolean;
  ratingStep: RatingStepView | null; // filled by plan 02-04
  roundEnd: RoundEndView | null; // filled by plan 02-05 — populated only in ROUND_END (plan 04-02 split this from GAME_END)
  gameEnd: GameEndView | null; // plan 04-02 — populated only in GAME_END
};

export type SessionIssued = { token: string; playerId: string };

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NAME_REQUIRED"
  | "NAME_LOCKED"
  | "NOT_IN_ROOM"
  | "RATE_LIMITED"
  | "NOT_HOST"
  | "SETTINGS_LOCKED"
  | "SETTINGS_INVALID"
  | "NOT_ENOUGH_PLAYERS"
  | "WRONG_PHASE"
  | "CAPTION_REQUIRED"
  | "MEME_TOO_LARGE"
  | "ALREADY_SUBMITTED"
  | "ALREADY_RATED"
  | "CANNOT_RATE_OWN"
  | "RATING_OUT_OF_RANGE"
  | "SWAP_ALREADY_USED";

export type ProtocolError = { code: ErrorCode; messageHe: string };

export const CLIENT_EVENTS = {
  createRoom: "create-room", // { name: string }
  joinRoom: "join-room", // { roomCode: string, name: string }
  rejoin: "rejoin", // {}  — token comes from the handshake, never the payload
  rename: "rename", // { name: string }   (added in plan 01-02)
  requestResync: "request-resync", // {}
  startGame: "start-game", // {}  — host-only, no payload (added in plan 02-01)
  changeSettings: "change-settings", // { key: SettingKey, value: number }  (added in plan 02-01; wired in 02-02)
  submitCaption: "submit-caption", // { meme: string } — base64-encoded PNG (Phase 5, replaces { text: string })
  submitRating: "submit-rating", // { stepIndex: number, value: RatingValue }  (added in plan 02-01; wired in 02-04)
  swapPhoto: "swap-photo", // {}  — host-blind, no payload; ROUND-06 (added in plan 04-01)
  skipRound: "skip-round", // {}  — host-only, no payload (Phase 6, LIVE-04)
  removePlayer: "remove-player", // { targetPlayerId: string } — host-only (Phase 6, LIVE-05)
} as const;

export const SERVER_EVENTS = {
  session: "session", // SessionIssued — sent once, to that socket only
  state: "state", // LobbySnapshot — full snapshot, never a diff
  error: "error", // ProtocolError
} as const;
