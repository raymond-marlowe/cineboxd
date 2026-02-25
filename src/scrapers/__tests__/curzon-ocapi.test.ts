import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  transformShowtimes,
  toLocalDateTime,
  cleanFilmTitle,
  OcapiResponse,
  VENUES,
} from "../curzon-ocapi";

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../__fixtures__/curzon-ocapi-showtimes.json"), "utf-8")
) as OcapiResponse;

const VENUE_MAP = new Map([
  ["SOH1", "Curzon Soho"],
  ["CAM1", "Curzon Camden"],
]);

// ---------------------------------------------------------------------------
// cleanFilmTitle
// ---------------------------------------------------------------------------
describe("cleanFilmTitle", () => {
  it('strips wrapping double-quotes: \'"Wuthering Heights"\' → "Wuthering Heights"', () => {
    expect(cleanFilmTitle('"Wuthering Heights"')).toBe("Wuthering Heights");
  });

  it("leaves a plain title unchanged", () => {
    expect(cleanFilmTitle("Novocaine")).toBe("Novocaine");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanFilmTitle('  "Some Film"  ')).toBe("Some Film");
  });
});

// ---------------------------------------------------------------------------
// toLocalDateTime
// ---------------------------------------------------------------------------
describe("toLocalDateTime", () => {
  it("converts a GMT timestamp correctly (February — no DST)", () => {
    const { date, time } = toLocalDateTime("2026-02-25T13:00:00+00:00");
    expect(date).toBe("2026-02-25");
    expect(time).toBe("13:00");
  });

  it("converts a BST timestamp correctly (June — UTC+1)", () => {
    // 2026-06-15T17:30:00+01:00 = UTC 16:30; London BST = 17:30
    const { date, time } = toLocalDateTime("2026-06-15T17:30:00+01:00");
    expect(date).toBe("2026-06-15");
    expect(time).toBe("17:30");
  });

  it("handles midnight correctly", () => {
    const { date, time } = toLocalDateTime("2026-03-10T00:00:00+00:00");
    expect(date).toBe("2026-03-10");
    expect(time).toBe("00:00");
  });

  it("handles 19:30 UTC in February", () => {
    const { time } = toLocalDateTime("2026-02-25T19:30:00+00:00");
    expect(time).toBe("19:30");
  });
});

// ---------------------------------------------------------------------------
// transformShowtimes — fixture-based
// ---------------------------------------------------------------------------
describe("transformShowtimes with fixture", () => {
  it("deduplicates: 3 raw showtimes → 2 unique screenings (SOH1-54176 appears twice)", () => {
    const screenings = transformShowtimes(fixture, VENUE_MAP);
    expect(screenings).toHaveLength(2);
  });

  it("extracts the Wuthering Heights screening correctly", () => {
    const screenings = transformShowtimes(fixture, VENUE_MAP);
    const wh = screenings.find((s) => s.title === "Wuthering Heights");
    expect(wh).toBeDefined();
    expect(wh?.venue).toBe("Curzon Soho");
    expect(wh?.date).toBe("2026-02-25");
    expect(wh?.time).toBe("13:00");
    expect(wh?.year).toBe(2026);
    expect(wh?.bookingUrl).toBe("https://www.curzon.com/ticketing/seats/SOH1-54176/");
    expect(wh?.format).toBeNull();
  });

  it("extracts the Novocaine (Camden) screening correctly", () => {
    const screenings = transformShowtimes(fixture, VENUE_MAP);
    const nov = screenings.find((s) => s.title === "Novocaine");
    expect(nov).toBeDefined();
    expect(nov?.venue).toBe("Curzon Camden");
    expect(nov?.date).toBe("2026-02-25");
    expect(nov?.time).toBe("19:30");
    expect(nov?.year).toBe(2025);
    expect(nov?.bookingUrl).toBe("https://www.curzon.com/ticketing/seats/CAM1-39498/");
  });

  it("includes sold-out sessions (isSoldOut=true still gets a Screening entry)", () => {
    const screenings = transformShowtimes(fixture, VENUE_MAP);
    // CAM1-39498 has isSoldOut=true but should still appear
    const soldOut = screenings.find((s) => s.bookingUrl?.includes("CAM1-39498"));
    expect(soldOut).toBeDefined();
  });

  it("all booking URLs follow the correct template", () => {
    const screenings = transformShowtimes(fixture, VENUE_MAP);
    for (const s of screenings) {
      expect(s.bookingUrl).toMatch(/^https:\/\/www\.curzon\.com\/ticketing\/seats\/[A-Z0-9]+-\d+\/$/);
    }
  });
});

// ---------------------------------------------------------------------------
// transformShowtimes — dedup across multiple calls (shared `seen` set)
// ---------------------------------------------------------------------------
describe("transformShowtimes deduplication across calls", () => {
  it("shared seen set prevents duplicates when same response is processed twice", () => {
    const seen = new Set<string>();
    const first = transformShowtimes(fixture, VENUE_MAP, seen);
    const second = transformShowtimes(fixture, VENUE_MAP, seen);
    // Second call should add nothing — all URLs already in `seen`
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
  });

  it("fresh seen set per call gives independent results", () => {
    const a = transformShowtimes(fixture, VENUE_MAP, new Set());
    const b = transformShowtimes(fixture, VENUE_MAP, new Set());
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// transformShowtimes — edge cases
// ---------------------------------------------------------------------------
describe("transformShowtimes edge cases", () => {
  it("returns empty array for empty showtimes list", () => {
    const data: OcapiResponse = { showtimes: [], relatedData: { films: [] } };
    expect(transformShowtimes(data, VENUE_MAP)).toHaveLength(0);
  });

  it("skips showtimes whose filmId has no matching film in relatedData", () => {
    const data: OcapiResponse = {
      showtimes: [{
        id: "SOH1-99999",
        filmId: "UNKNOWN",
        siteId: "SOH1",
        schedule: { startsAt: "2026-03-01T18:00:00+00:00" },
        isSoldOut: false,
      }],
      relatedData: { films: [] },
    };
    expect(transformShowtimes(data, VENUE_MAP)).toHaveLength(0);
  });

  it("skips showtimes from siteIds not in venueMap", () => {
    const data: OcapiResponse = {
      showtimes: [{
        id: "MAY1-12345",
        filmId: "HO00006762",
        siteId: "MAY1", // Mayfair — not in our VENUE_MAP for this test
        schedule: { startsAt: "2026-03-01T20:00:00+00:00" },
        isSoldOut: false,
      }],
      relatedData: { films: [{ id: "HO00006762", title: { text: "Some Film" }, releaseDate: "2026-01-01" }] },
    };
    expect(transformShowtimes(data, VENUE_MAP)).toHaveLength(0);
  });

  it("handles missing relatedData gracefully", () => {
    const data: OcapiResponse = { showtimes: [] };
    expect(transformShowtimes(data, VENUE_MAP)).toHaveLength(0);
  });

  it("uses null year when releaseDate is absent", () => {
    const data: OcapiResponse = {
      showtimes: [{
        id: "SOH1-77777",
        filmId: "FILM1",
        siteId: "SOH1",
        schedule: { startsAt: "2026-03-01T15:00:00+00:00" },
        isSoldOut: false,
      }],
      relatedData: {
        films: [{ id: "FILM1", title: { text: "No Date Film" } }],
      },
    };
    const results = transformShowtimes(data, VENUE_MAP);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VENUES constant — siteId correctness
// ---------------------------------------------------------------------------
describe("VENUES siteId mapping", () => {
  it("contains exactly 10 London venues", () => {
    expect(VENUES).toHaveLength(10);
  });

  it("uses WIM01 for Curzon Wimbledon", () => {
    const wimbledon = VENUES.find((v) => v.name === "Curzon Wimbledon");
    expect(wimbledon).toBeDefined();
    expect(wimbledon?.siteId).toBe("WIM01");
  });

  it("all expected venues are present with correct siteIds", () => {
    const map = new Map(VENUES.map((v) => [v.name, v.siteId]));
    expect(map.get("Curzon Soho")).toBe("SOH1");
    expect(map.get("Curzon Camden")).toBe("CAM1");
    expect(map.get("Curzon Mayfair")).toBe("MAY1");
    expect(map.get("Curzon Bloomsbury")).toBe("BLO1");
    expect(map.get("Curzon Victoria")).toBe("VIC1");
    expect(map.get("Curzon Hoxton")).toBe("HOX1");
    expect(map.get("Curzon Richmond")).toBe("RIC1");
    expect(map.get("Curzon Kingston")).toBe("KIN1");
    expect(map.get("Curzon Wimbledon")).toBe("WIM01");
    expect(map.get("Curzon Aldgate")).toBe("ALD1");
  });
});
