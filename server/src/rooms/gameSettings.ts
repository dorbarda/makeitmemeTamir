import type { GameSettings, SettingKey } from "@shared/protocol.js";
import {
  DEFAULT_RATING_SECONDS,
  DEFAULT_ROUND_COUNT,
  DEFAULT_WRITING_SECONDS,
  RATING_SECONDS_PRESETS,
  ROUND_COUNT_PRESETS,
  WRITING_SECONDS_PRESETS,
} from "../config.js";

/**
 * D-02 — every host setting is a preset value, never free text or a slider.
 * The three config.ts arrays are the only source; never re-listed as fresh
 * literals here, so a preset change in one place is a preset change
 * everywhere.
 */
export const SETTING_PRESETS: Record<SettingKey, readonly number[]> = {
  rounds: ROUND_COUNT_PRESETS,
  writingSeconds: WRITING_SECONDS_PRESETS,
  ratingSeconds: RATING_SECONDS_PRESETS,
};

/**
 * The single server-side authority on what a legal setting value is
 * (T-02-03). `key` is checked with `Object.hasOwn` against the preset map
 * itself — never a plain `key in SETTING_PRESETS`/index lookup — so an
 * inherited property name such as `constructor` or `__proto__` can never
 * resolve to an array and smuggle a value through. Membership only, never a
 * range check: a value that merely falls between two presets is refused
 * rather than clamped to the nearest one.
 */
export function isPresetValue(key: string, value: unknown): key is SettingKey {
  if (!Object.hasOwn(SETTING_PRESETS, key)) return false;
  if (typeof value !== "number" || !Number.isInteger(value)) return false;

  const presets = SETTING_PRESETS[key as SettingKey];
  return presets.includes(value);
}

/** D-04 (user-confirmed): 3 rounds / 60s writing / 10s rating. */
export function defaultSettings(): GameSettings {
  return {
    rounds: DEFAULT_ROUND_COUNT,
    writingSeconds: DEFAULT_WRITING_SECONDS,
    ratingSeconds: DEFAULT_RATING_SECONDS,
  };
}
