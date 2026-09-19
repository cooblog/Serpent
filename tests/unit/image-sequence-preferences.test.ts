import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_SEQUENCE_PREFERENCES,
  IMAGE_SEQUENCE_PREFERENCES_KEY,
  imageSequenceImportFlags,
  loadImageSequencePreferences,
  saveImageSequencePreferences,
} from "../../src/renderer/image-sequence-preferences";

function storage(initial?: string): Map<string, string> & {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(IMAGE_SEQUENCE_PREFERENCES_KEY, initial);
  return Object.assign(values, {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  });
}

describe("image sequence preferences", () => {
  it("defaults to detecting sequences and asking before grouping", () => {
    expect(loadImageSequencePreferences(storage())).toEqual(
      DEFAULT_IMAGE_SEQUENCE_PREFERENCES,
    );
    expect(DEFAULT_IMAGE_SEQUENCE_PREFERENCES).toEqual({
      version: 2,
      detectionEnabled: true,
      autoDetectOnImport: false,
    });
  });

  it("migrates v1 storage with detection left on", () => {
    const store = storage(
      JSON.stringify({ version: 1, autoDetectOnImport: false }),
    );
    expect(loadImageSequencePreferences(store)).toEqual({
      version: 2,
      detectionEnabled: true,
      autoDetectOnImport: false,
    });
  });

  it("persists both detection toggles", () => {
    const store = storage();
    saveImageSequencePreferences(
      { version: 2, detectionEnabled: true, autoDetectOnImport: false },
      store,
    );
    expect(loadImageSequencePreferences(store)).toEqual({
      version: 2,
      detectionEnabled: true,
      autoDetectOnImport: false,
    });
  });

  it("turns auto-create off when detection is off", () => {
    expect(
      imageSequenceImportFlags({
        version: 2,
        detectionEnabled: false,
        autoDetectOnImport: true,
      }),
    ).toEqual({
      detectImageSequences: false,
      autoDetectImageSequences: false,
    });
  });

  it("ignores malformed or unsupported values", () => {
    expect(loadImageSequencePreferences(storage("{}"))).toEqual(
      DEFAULT_IMAGE_SEQUENCE_PREFERENCES,
    );
    expect(loadImageSequencePreferences(storage("not-json"))).toEqual(
      DEFAULT_IMAGE_SEQUENCE_PREFERENCES,
    );
  });
});
