import { describe, it, expect } from "vitest";
import { defaultSettings, isPresetValue, SETTING_PRESETS } from "../src/rooms/gameSettings.js";
import { Room } from "../src/rooms/Room.js";
import {
  RATING_SECONDS_PRESETS,
  ROUND_COUNT_PRESETS,
  WRITING_SECONDS_PRESETS,
} from "../src/config.js";
import type { SettingKey } from "@shared/protocol.js";

// One-step-either-side neighbours of each preset array, imported from
// config.ts rather than repeating the nine numbers a second time.
const REJECT_VALUES: Record<SettingKey, number[]> = {
  rounds: [2, 4, 6, 8],
  writingSeconds: [44, 46, 89, 91],
  ratingSeconds: [7, 9, 14, 16],
};

describe("SETTING_PRESETS", () => {
  it("is built from the config.ts preset arrays, not fresh literals", () => {
    expect(SETTING_PRESETS.rounds).toBe(ROUND_COUNT_PRESETS);
    expect(SETTING_PRESETS.writingSeconds).toBe(WRITING_SECONDS_PRESETS);
    expect(SETTING_PRESETS.ratingSeconds).toBe(RATING_SECONDS_PRESETS);
  });
});

describe("defaultSettings", () => {
  it("returns 3 rounds / 60s writing / 10s rating (D-04)", () => {
    expect(defaultSettings()).toEqual({ rounds: 3, writingSeconds: 60, ratingSeconds: 10 });
  });
});

describe("isPresetValue", () => {
  for (const key of Object.keys(SETTING_PRESETS) as SettingKey[]) {
    for (const value of SETTING_PRESETS[key]) {
      it(`accepts ${key}=${value} (a legal preset)`, () => {
        expect(isPresetValue(key, value)).toBe(true);
      });
    }

    for (const value of REJECT_VALUES[key]) {
      it(`refuses ${key}=${value} (one step off a preset)`, () => {
        expect(isPresetValue(key, value)).toBe(false);
      });
    }
  }

  it("refuses a non-integer value", () => {
    expect(isPresetValue("rounds", 3.5)).toBe(false);
  });

  it("refuses NaN", () => {
    expect(isPresetValue("rounds", NaN)).toBe(false);
  });

  it("refuses Infinity", () => {
    expect(isPresetValue("writingSeconds", Infinity)).toBe(false);
  });

  it("refuses a numeric string", () => {
    expect(isPresetValue("rounds", "5")).toBe(false);
  });

  it("refuses an unknown key", () => {
    expect(isPresetValue("notASetting", 3)).toBe(false);
  });

  it("refuses '__proto__' as a key, never resolving to an inherited property", () => {
    expect(isPresetValue("__proto__", 3)).toBe(false);
  });

  it("refuses 'constructor' as a key, never resolving to an inherited property", () => {
    expect(isPresetValue("constructor", 3)).toBe(false);
  });
});

describe("Room.changeSetting", () => {
  function makeRoomWithHostAndGuest() {
    const room = new Room("1111", "http://x/join/1111", "data:image/png;base64,");
    const host = room.addPlayer("Host", "t-host");
    const guest = room.addPlayer("Guest", "t-guest");
    return { room, host, guest };
  }

  it("refuses a non-host with NOT_HOST and leaves the setting unchanged", () => {
    const { room, guest } = makeRoomWithHostAndGuest();
    const before = room.settings.rounds;

    const result = room.changeSetting(guest.id, "rounds", 5);

    expect(result).toEqual({ ok: false, error: "NOT_HOST" });
    expect(room.settings.rounds).toBe(before);
  });

  it("refuses a non-preset value from the host with SETTINGS_INVALID and leaves the setting unchanged", () => {
    const { room, host } = makeRoomWithHostAndGuest();
    const before = room.settings.rounds;

    const result = room.changeSetting(host.id, "rounds", 4);

    expect(result).toEqual({ ok: false, error: "SETTINGS_INVALID" });
    expect(room.settings.rounds).toBe(before);
  });

  it("accepts a legal preset value from the host and stores it", () => {
    const { room, host } = makeRoomWithHostAndGuest();

    const result = room.changeSetting(host.id, "rounds", 5);

    expect(result).toEqual({ ok: true, settings: room.settings });
    expect(room.settings.rounds).toBe(5);
  });

  it("refuses every rejection-list value for every key, leaving the setting unchanged each time", () => {
    const { room, host } = makeRoomWithHostAndGuest();

    for (const key of Object.keys(REJECT_VALUES) as SettingKey[]) {
      const before = room.settings[key];
      for (const value of REJECT_VALUES[key]) {
        const result = room.changeSetting(host.id, key, value);
        expect(result).toEqual({ ok: false, error: "SETTINGS_INVALID" });
        expect(room.settings[key]).toBe(before);
      }
    }
  });

  it("refuses a change after the game has started with SETTINGS_LOCKED", () => {
    const { room, host, guest } = makeRoomWithHostAndGuest();
    room.addPlayer("Third", "t-third");
    room.startGame(host.id);

    try {
      const result = room.changeSetting(host.id, "rounds", 7);

      expect(result).toEqual({ ok: false, error: "SETTINGS_LOCKED" });
      // Silence unused-variable lint for guest, kept for readability of intent.
      expect(guest).toBeTruthy();
    } finally {
      // startGame schedules a real writing-phase timer; dispose it so it
      // never fires against a room this test has already finished with.
      room.dispose();
    }
  });
});
