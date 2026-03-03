import { describe, it, expect } from "vitest";
import {
  isValidLbUsername,
  normaliseLbUsername,
  buildSoloUrl,
  buildTogetherUrl,
} from "../urls";

// ---------------------------------------------------------------------------
// isValidLbUsername
// ---------------------------------------------------------------------------
describe("isValidLbUsername", () => {
  it("accepts lowercase letters", () => expect(isValidLbUsername("alice")).toBe(true));
  it("accepts digits", () => expect(isValidLbUsername("user123")).toBe(true));
  it("accepts underscores", () => expect(isValidLbUsername("my_name")).toBe(true));
  it("accepts mixed alphanumeric + underscore", () =>
    expect(isValidLbUsername("alice_bob99")).toBe(true));

  it("rejects uppercase letters (not yet normalised)", () =>
    expect(isValidLbUsername("Alice")).toBe(false));
  it("rejects hyphens", () => expect(isValidLbUsername("alice-bob")).toBe(false));
  it("rejects spaces", () => expect(isValidLbUsername("alice bob")).toBe(false));
  it("rejects empty string", () => expect(isValidLbUsername("")).toBe(false));
  it("rejects dots", () => expect(isValidLbUsername("alice.bob")).toBe(false));
});

// ---------------------------------------------------------------------------
// normaliseLbUsername
// ---------------------------------------------------------------------------
describe("normaliseLbUsername", () => {
  it("lowercases", () => expect(normaliseLbUsername("Alice")).toBe("alice"));
  it("lowercases all-caps", () => expect(normaliseLbUsername("ALICE")).toBe("alice"));
  it("leaves lowercase unchanged", () => expect(normaliseLbUsername("alice")).toBe("alice"));
  it("lowercases mixed", () => expect(normaliseLbUsername("AlIcE_99")).toBe("alice_99"));
});

// ---------------------------------------------------------------------------
// buildSoloUrl
// ---------------------------------------------------------------------------
describe("buildSoloUrl", () => {
  it("builds /u/<username>", () => expect(buildSoloUrl("alice")).toBe("/u/alice"));
  it("normalises to lowercase", () => expect(buildSoloUrl("Alice")).toBe("/u/alice"));
  it("throws on invalid username", () =>
    expect(() => buildSoloUrl("alice-bob")).toThrow());

  it("passes through non-identity query params", () =>
    expect(buildSoloUrl("alice", new URLSearchParams("view=grid&venue=BFI"))).toBe(
      "/u/alice?view=grid&venue=BFI"
    ));

  it("strips identity query params (user/users/list)", () =>
    expect(
      buildSoloUrl("alice", new URLSearchParams("user=alice&view=grid"))
    ).toBe("/u/alice?view=grid"));

  it("accepts a plain Record", () =>
    expect(buildSoloUrl("alice", { view: "calendar" })).toBe("/u/alice?view=calendar"));

  it("omits query string when no extra params", () =>
    expect(buildSoloUrl("alice", new URLSearchParams())).toBe("/u/alice"));
});

// ---------------------------------------------------------------------------
// buildTogetherUrl
// ---------------------------------------------------------------------------
describe("buildTogetherUrl", () => {
  it("builds /t/u1+u2", () =>
    expect(buildTogetherUrl(["alice", "bob"])).toBe("/t/alice+bob"));

  it("normalises to lowercase", () =>
    expect(buildTogetherUrl(["Alice", "BOB"])).toBe("/t/alice+bob"));

  it("supports up to 5 users", () =>
    expect(buildTogetherUrl(["a", "b", "c", "d", "e"])).toBe("/t/a+b+c+d+e"));

  it("throws for fewer than 2 users", () =>
    expect(() => buildTogetherUrl(["alice"])).toThrow());

  it("throws for more than 5 users", () =>
    expect(() => buildTogetherUrl(["a", "b", "c", "d", "e", "f"])).toThrow());

  it("throws for invalid username in group", () =>
    expect(() => buildTogetherUrl(["alice", "bob-bad"])).toThrow());

  it("passes through non-identity query params", () =>
    expect(
      buildTogetherUrl(["alice", "bob"], new URLSearchParams("view=grid"))
    ).toBe("/t/alice+bob?view=grid"));

  it("strips identity params but keeps other params", () =>
    // "users" is an identity param → stripped; "view" is UI state → kept
    expect(
      buildTogetherUrl(["alice", "bob"], new URLSearchParams("users=alice,bob&view=list"))
    ).toBe("/t/alice+bob?view=list"));
});

// ---------------------------------------------------------------------------
// Together URL parsing round-trip (simulates what /t/[users]/page.tsx does)
// ---------------------------------------------------------------------------
describe("together URL parsing round-trip", () => {
  const parseUsers = (raw: string) => {
    const parts = raw.split("+").map((u) => normaliseLbUsername(u.trim()));
    if (parts.length < 2 || parts.length > 5) return null;
    if (!parts.every(isValidLbUsername)) return null;
    return parts;
  };

  it("parses alice+bob", () => expect(parseUsers("alice+bob")).toEqual(["alice", "bob"]));
  it("parses three users", () =>
    expect(parseUsers("alice+bob+charlie")).toEqual(["alice", "bob", "charlie"]));
  it("returns null for a single user", () => expect(parseUsers("alice")).toBeNull());
  it("returns null for 6 users", () =>
    expect(parseUsers("a+b+c+d+e+f")).toBeNull());
  it("returns null for invalid username in group", () =>
    expect(parseUsers("alice+bob-bad")).toBeNull());
  it("normalises uppercase", () =>
    expect(parseUsers("Alice+BOB")).toEqual(["alice", "bob"]));
});
