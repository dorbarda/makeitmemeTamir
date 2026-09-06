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
};

export const HEBREW_UI = {
  namePlaceholder: "איך קוראים לך?",
  joinButton: "הצטרפות",
  createButton: "פתיחת חדר",
  renameButton: "שינוי שם",
  waitingForPlayers: "צריך לפחות 3 שחקנים כדי להתחיל",
  playersInRoom: "שחקנים בחדר",
};
