import { describe, it, expect, afterEach } from "vitest";
import { isEnabled, flagState } from "../feature-flags";

// Restore env after each test so they don't bleed into each other.
afterEach(() => {
  delete process.env.__TEST_FLAG__;
});

describe("isEnabled", () => {
  it('returns true for "true"', () => {
    process.env.__TEST_FLAG__ = "true";
    expect(isEnabled("__TEST_FLAG__")).toBe(true);
  });

  it('returns true for "1"', () => {
    process.env.__TEST_FLAG__ = "1";
    expect(isEnabled("__TEST_FLAG__")).toBe(true);
  });

  it('returns true for "yes"', () => {
    process.env.__TEST_FLAG__ = "yes";
    expect(isEnabled("__TEST_FLAG__")).toBe(true);
  });

  it('returns true for "on"', () => {
    process.env.__TEST_FLAG__ = "on";
    expect(isEnabled("__TEST_FLAG__")).toBe(true);
  });

  it("is case-insensitive: True, TRUE, YES, ON all enable", () => {
    for (const val of ["True", "TRUE", "YES", "ON", "On"]) {
      process.env.__TEST_FLAG__ = val;
      expect(isEnabled("__TEST_FLAG__"), `expected true for "${val}"`).toBe(true);
    }
  });

  it("accepts leading/trailing whitespace", () => {
    process.env.__TEST_FLAG__ = "  true  ";
    expect(isEnabled("__TEST_FLAG__")).toBe(true);
  });

  it('returns false for "false"', () => {
    process.env.__TEST_FLAG__ = "false";
    expect(isEnabled("__TEST_FLAG__")).toBe(false);
  });

  it('returns false for "0"', () => {
    process.env.__TEST_FLAG__ = "0";
    expect(isEnabled("__TEST_FLAG__")).toBe(false);
  });

  it("returns false when env var is not set", () => {
    expect(isEnabled("__TEST_FLAG__")).toBe(false);
  });

  it("returns false for empty string", () => {
    process.env.__TEST_FLAG__ = "";
    expect(isEnabled("__TEST_FLAG__")).toBe(false);
  });

  it('returns false for arbitrary unknown value like "enabled"', () => {
    process.env.__TEST_FLAG__ = "enabled";
    expect(isEnabled("__TEST_FLAG__")).toBe(false);
  });
});

describe("flagState", () => {
  it('returns "enabled" for truthy values', () => {
    for (const val of ["true", "1", "yes", "on", "True", "YES"]) {
      process.env.__TEST_FLAG__ = val;
      expect(flagState("__TEST_FLAG__"), `expected enabled for "${val}"`).toBe("enabled");
    }
  });

  it('returns "disabled_unset" when env var is not defined', () => {
    expect(flagState("__TEST_FLAG__")).toBe("disabled_unset");
  });

  it('returns "disabled_false" when env var is defined but not truthy', () => {
    for (const val of ["false", "0", "no", "off", "maybe", ""]) {
      process.env.__TEST_FLAG__ = val;
      expect(flagState("__TEST_FLAG__"), `expected disabled_false for "${val}"`).toBe("disabled_false");
    }
  });
});
