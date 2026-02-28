import { describe, it, expect, afterEach } from "vitest";
import { isEnabled } from "../feature-flags";

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
