import type { ErrorCode } from "./protocol.js";

/**
 * The single Hebrew string source for both packages. No player-facing text
 * is ever written inline in a component or a handler — every message a
 * player can see comes from one of the two maps below.
 */
export const HEBREW_ERRORS: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: "לא נמצא חדר עם הקוד הזה",
  ROOM_FULL: "החדר מלא — כבר יש 20 שחקנים בפנים",
  NAME_REQUIRED: "צריך להקליד שם כדי להיכנס",
  NAME_LOCKED: "אי אפשר לשנות שם אחרי שהמשחק התחיל",
  NOT_IN_ROOM: "אינך נמצא בחדר הזה",
  RATE_LIMITED: "רגע אחד — יותר מדי ניסיונות. נסו שוב בעוד כמה שניות",
  // plan 02-01 — round engine error codes
  NOT_HOST: "רק המנחה יכול לעשות את זה",
  SETTINGS_LOCKED: "אי אפשר לשנות הגדרות אחרי שהמשחק התחיל",
  SETTINGS_INVALID: "הערך שנבחר אינו חוקי",
  NOT_ENOUGH_PLAYERS: "צריך לפחות 3 שחקנים כדי להתחיל",
  WRONG_PHASE: "אי אפשר לעשות את זה עכשיו",
  CAPTION_REQUIRED: "צריך לכתוב כיתוב כדי לשלוח",
  MEME_TOO_LARGE: "התמונה גדולה מדי — נסו לצמצם את הכיתובים",
  ALREADY_SUBMITTED: "כבר שלחת כיתוב לסיבוב הזה",
  ALREADY_RATED: "כבר דירגת את התמונה הזו",
  CANNOT_RATE_OWN: "אי אפשר לדרג את התמונה של עצמך",
  RATING_OUT_OF_RANGE: "הדירוג חייב להיות בין 1 ל-3",
  SWAP_ALREADY_USED: "כבר החלפת תמונה בסיבוב הזה",
};

export const HEBREW_UI = {
  namePlaceholder: "איך קוראים לך?",
  joinButton: "הצטרפות",
  createButton: "פתיחת חדר",
  renameButton: "שינוי שם",
  waitingForPlayers: "צריך לפחות 3 שחקנים כדי להתחיל",
  playersInRoom: "שחקנים בחדר",
  // plan 01-03 — home / deep-link join / manual code entry
  codePlaceholder: "קוד החדר",
  enterCodeTitle: "הכניסו את קוד החדר",
  haveACode: "יש לי קוד חדר",
  joiningRoomPrefix: "הצטרפות לחדר",
  // plan 01-03 — lobby presentation, share, QR
  roomCodeLabel: "קוד החדר",
  shareButton: "שליחת הקישור",
  copiedToast: "הקישור הועתק",
  scanToJoin: "או סרקו את הקוד",
  connectedCount: "מחוברים",
  readyToStart: "אפשר להתחיל",
  // plan 01-04 — reconnect grace, host transfer
  reconnecting: "מתחבר מחדש...",
  hostChanged: "המנחה התחלף",
  disconnectedTag: "(מנותק/ת)",
  // plan 02-01 — host settings panel (wired by plan 02-02) and start-game
  settingsTitle: "הגדרות משחק",
  roundsLabel: "מספר סיבובים",
  writingSecondsLabel: "זמן לכתיבה",
  ratingSecondsLabel: "זמן לדירוג",
  secondsSuffix: "שניות",
  settingsLockedNote: "ההגדרות ננעלו — המשחק כבר התחיל",
  startGameButton: "התחלת המשחק",
  // plan 02-01 — in-game phase headings and round position (Round.tsx)
  roundLabel: "סיבוב",
  ofSeparator: "מתוך",
  writingHeading: "כותבים כיתוב מצחיק",
  revealBreakHeading: "רגע לפני החשיפה",
  ratingHeading: "מדרגים את התמונה",
  roundEndHeading: "הסיבוב הסתיים",
  gameEndHeading: "המשחק נגמר",
  timeLeftLabel: "זמן שנותר",
  // plan 02-03 — writing phase (caption submission, progress-only visibility)
  captionPlaceholder: "כתבו כיתוב מצחיק...",
  sendCaptionButton: "שליחה",
  alreadySubmittedNote: "הכיתוב שלך נשלח",
  waitingForOthers: "ממתינים לשאר השחקנים",
  submittedProgressSuffix: "שלחו כיתוב",
  // plan 02-04 — per-meme rating step
  yourMemeWaiting: "התמונה שלך מחכה לתורה",
  ratedAlreadyNote: "כבר דירגת את התמונה הזו",
  // plan 02-05 — round-end / game-end (D-09's skip line; ranking is
  // explicitly Phase 4, see RoundEndPanel.tsx)
  roundEndTooFewCaptions: "לא הגיעו מספיק כיתובים כדי לדרג בסיבוב הזה",
  // plan 03-01 — real content: photos, tier names, scoreboard
  ratingTierFunniest: "דנה מגנזי",
  ratingTierFine: "תמיר פטריות",
  ratingTierMeh: "תמיר בפאניקה",
  photoAlt: "תמונה של תמיר",
  scoreboardHeading: "טבלת הניקוד",
  // plan 04-01 — photo swap button and real ranked round-results score
  swapPhotoButton: "החלפת תמונה",
  roundResultsPointsSuffix: "נקודות",
  // plan 04-02 — game-end winner banner and best-of-the-night list
  winnerHeading: "המנצחים",
  bestOfNightHeading: "המצחיקים של הערב",
  bestOfNightEmpty: "עדיין אין מספיק דירוגים כדי לבחור את המצחיקים של הערב",
  // plan 05-03 — multi-box drag editor
  memeEditorInstructions: "גררו כל כיתוב למקום הרצוי על התמונה",
  addCaptionBoxButton: "הוספת כיתוב",
  deleteCaptionButton: "מחיקה",
};
