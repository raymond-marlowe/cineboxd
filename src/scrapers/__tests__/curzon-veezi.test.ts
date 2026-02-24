import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseVeeziDate, parseVeeziTime, parseVeeziPage } from "../curzon-veezi";

const fixturesDir = path.join(__dirname, "../__fixtures__");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

// ---------------------------------------------------------------------------
// parseVeeziDate
// ---------------------------------------------------------------------------
describe("parseVeeziDate", () => {
  it("parses a standard future date", () => {
    const result = parseVeeziDate("Monday 15, June");
    expect(result).toMatch(/^\d{4}-06-15$/);
  });

  it("parses a date with single-digit day", () => {
    const result = parseVeeziDate("Sunday 1, March");
    expect(result).toMatch(/^\d{4}-03-01$/);
  });

  it("returns null for empty string", () => {
    expect(parseVeeziDate("")).toBeNull();
  });

  it("returns null for unrecognised month", () => {
    expect(parseVeeziDate("Monday 10, Octember")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseVeeziDate("not a date at all")).toBeNull();
  });

  it("rolls over to next year for a clearly past month", () => {
    // January is month 0; today is February 2026 so January is in the past.
    const result = parseVeeziDate("Wednesday 5, January");
    expect(result).toMatch(/^\d{4}-01-05$/);
    const year = parseInt(result!.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(new Date().getFullYear());
  });
});

// ---------------------------------------------------------------------------
// parseVeeziTime
// ---------------------------------------------------------------------------
describe("parseVeeziTime", () => {
  it("converts 6:15 PM", () => {
    expect(parseVeeziTime("6:15 PM")).toBe("18:15");
  });

  it("converts 9:00 PM", () => {
    expect(parseVeeziTime("9:00 PM")).toBe("21:00");
  });

  it("converts 12:00 PM (noon)", () => {
    expect(parseVeeziTime("12:00 PM")).toBe("12:00");
  });

  it("converts 12:00 AM (midnight)", () => {
    expect(parseVeeziTime("12:00 AM")).toBe("00:00");
  });

  it("converts 8:30 AM", () => {
    expect(parseVeeziTime("8:30 AM")).toBe("08:30");
  });

  it("is case-insensitive for am/pm", () => {
    expect(parseVeeziTime("6:15 pm")).toBe("18:15");
  });

  it("returns null for empty string", () => {
    expect(parseVeeziTime("")).toBeNull();
  });

  it("returns null for malformed time", () => {
    expect(parseVeeziTime("not a time")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseVeeziPage — Sea Containers fixture (has screenings)
// ---------------------------------------------------------------------------
describe("parseVeeziPage with Sea Containers fixture", () => {
  const html = loadFixture("curzon-sea-containers.html");
  const venueName = "Curzon Sea Containers";

  it("returns at least one screening", () => {
    const screenings = parseVeeziPage(html, venueName);
    expect(screenings.length).toBeGreaterThan(0);
  });

  it("all screenings have the correct venue", () => {
    const screenings = parseVeeziPage(html, venueName);
    for (const s of screenings) {
      expect(s.venue).toBe(venueName);
    }
  });

  it("all screenings have valid date format (YYYY-MM-DD)", () => {
    const screenings = parseVeeziPage(html, venueName);
    for (const s of screenings) {
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all screenings have valid time format (HH:MM)", () => {
    const screenings = parseVeeziPage(html, venueName);
    for (const s of screenings) {
      expect(s.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("all screenings have Veezi booking URLs", () => {
    const screenings = parseVeeziPage(html, venueName);
    for (const s of screenings) {
      expect(s.bookingUrl).toMatch(/^https:\/\/ticketing\.eu\.veezi\.com\/purchase\//);
    }
  });

  it("includes 'EPiC: Elvis Presley in Concert' screening on 2026-02-27", () => {
    const screenings = parseVeeziPage(html, venueName);
    const match = screenings.find(
      (s) => s.title === "EPiC: Elvis Presley in Concert" && s.date === "2026-02-27"
    );
    expect(match).toBeDefined();
    expect(match?.time).toBe("18:15");
    expect(match?.bookingUrl).toBe(
      "https://ticketing.eu.veezi.com/purchase/20192?siteToken=a4xawmcnn5xz11am1ayy6ykfdm"
    );
  });

  it("has no duplicate booking URLs", () => {
    const screenings = parseVeeziPage(html, venueName);
    const urls = screenings.map((s) => s.bookingUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

// ---------------------------------------------------------------------------
// parseVeeziPage — Goldsmiths fixture ("no shows scheduled")
// ---------------------------------------------------------------------------
describe("parseVeeziPage with Goldsmiths fixture", () => {
  it("returns an empty array when no shows are scheduled", () => {
    const html = loadFixture("curzon-goldsmiths.html");
    const screenings = parseVeeziPage(html, "Curzon Goldsmiths");
    expect(screenings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deduplication across repeated calls with the same HTML
// ---------------------------------------------------------------------------
describe("parseVeeziPage deduplication", () => {
  it("calling the parser twice independently produces independent results (no cross-call state)", () => {
    const html = loadFixture("curzon-sea-containers.html");
    const first = parseVeeziPage(html, "Curzon Sea Containers");
    const second = parseVeeziPage(html, "Curzon Sea Containers");
    // Each call should return the same count (seen set is call-local)
    expect(first.length).toBe(second.length);
  });
});
