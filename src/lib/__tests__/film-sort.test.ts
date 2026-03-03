import { describe, it, expect } from "vitest";
import {
  getEarliestScreeningDate,
  isComingSoon,
  applyDiscoveryFilters,
} from "../film-sort";
import type { MatchedScreening } from "../types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeMatch(
  title: string,
  screeningDates: string[],
  opts: {
    year?: number;
    rating?: number;
    releaseDate?: string;
    venue?: string;
    time?: string;
  } = {}
): MatchedScreening {
  const venue = opts.venue ?? "Test Cinema";
  const time = opts.time ?? "18:00";
  return {
    film: { title, year: opts.year ?? null, letterboxdUri: "" },
    screenings: screeningDates.map((date) => ({
      title,
      year: opts.year ?? null,
      date,
      time,
      venue,
      bookingUrl: null,
      format: null,
    })),
    metadata: {
      posterPath: null,
      overview: null,
      director: null,
      tmdbRating: opts.rating ?? null,
      imdbId: null,
      releaseDate: opts.releaseDate ?? null,
    },
  };
}

const TODAY = "2026-03-03";

const defaultOpts = {
  sortMode: "soonest" as const,
  filmSearch: "",
  hideUnreleased: false,
  venueFilter: "all",
  postcodeCoords: null,
  sortByDistance: false,
  maxDistanceMiles: null,
  today: TODAY,
};

// ---------------------------------------------------------------------------
// getEarliestScreeningDate
// ---------------------------------------------------------------------------
describe("getEarliestScreeningDate", () => {
  it("returns the earliest datetime across multiple screenings", () => {
    const m = makeMatch("A", ["2026-03-10", "2026-03-05", "2026-03-15"]);
    expect(getEarliestScreeningDate(m)).toBe("2026-03-05T18:00");
  });

  it("handles a single screening", () => {
    const m = makeMatch("A", ["2026-04-01"]);
    expect(getEarliestScreeningDate(m)).toBe("2026-04-01T18:00");
  });

  it("returns a far-future sentinel for empty screenings", () => {
    const m = makeMatch("A", []);
    expect(getEarliestScreeningDate(m)).toBe("9999-12-31T23:59");
  });

  it("respects time when dates are equal", () => {
    const m = makeMatch("A", ["2026-03-10", "2026-03-10"], { time: "20:00" });
    // both at same date+time
    m.screenings[0].time = "20:00";
    m.screenings[1].time = "14:30";
    expect(getEarliestScreeningDate(m)).toBe("2026-03-10T14:30");
  });
});

// ---------------------------------------------------------------------------
// isComingSoon
// ---------------------------------------------------------------------------
describe("isComingSoon", () => {
  it("returns true when release date is after today", () => {
    const m = makeMatch("A", ["2026-04-01"], { releaseDate: "2026-04-01" });
    expect(isComingSoon(m, TODAY)).toBe(true);
  });

  it("returns false when release date equals today", () => {
    const m = makeMatch("A", ["2026-04-01"], { releaseDate: TODAY });
    expect(isComingSoon(m, TODAY)).toBe(false);
  });

  it("returns false when release date is in the past", () => {
    const m = makeMatch("A", ["2026-04-01"], { releaseDate: "2025-01-01" });
    expect(isComingSoon(m, TODAY)).toBe(false);
  });

  it("returns false when releaseDate is null", () => {
    const m = makeMatch("A", ["2026-04-01"]);
    expect(isComingSoon(m, TODAY)).toBe(false);
  });

  it("returns false when metadata is absent", () => {
    const m = makeMatch("A", ["2026-04-01"]);
    m.metadata = undefined;
    expect(isComingSoon(m, TODAY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyDiscoveryFilters
// ---------------------------------------------------------------------------
describe("applyDiscoveryFilters", () => {
  it("returns all matches when no filters active", () => {
    const matches = [makeMatch("A", ["2026-03-10"]), makeMatch("B", ["2026-03-05"])];
    expect(applyDiscoveryFilters(matches, defaultOpts)).toHaveLength(2);
  });

  // ── Title search ─────────────────────────────────────────────────────────

  it("filters by title search (case-insensitive)", () => {
    const matches = [makeMatch("Alien", ["2026-03-10"]), makeMatch("Blade Runner", ["2026-03-10"])];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, filmSearch: "alien" });
    expect(result).toHaveLength(1);
    expect(result[0].film.title).toBe("Alien");
  });

  it("matches a substring anywhere in the title", () => {
    const matches = [makeMatch("The Alien", ["2026-03-10"]), makeMatch("Blade Runner", ["2026-03-10"])];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, filmSearch: "alien" });
    expect(result).toHaveLength(1);
  });

  it("returns all when filmSearch is blank", () => {
    const matches = [makeMatch("Alien", ["2026-03-10"]), makeMatch("Blade Runner", ["2026-03-10"])];
    expect(applyDiscoveryFilters(matches, { ...defaultOpts, filmSearch: "   " })).toHaveLength(2);
  });

  // ── Venue filter ──────────────────────────────────────────────────────────

  it("filters screenings by venue and drops matches with no remaining screenings", () => {
    const matches = [
      makeMatch("A", ["2026-03-10"], { venue: "BFI" }),
      makeMatch("B", ["2026-03-10"], { venue: "Curzon" }),
    ];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, venueFilter: "BFI" });
    expect(result).toHaveLength(1);
    expect(result[0].film.title).toBe("A");
  });

  it("keeps all venues when venueFilter is 'all'", () => {
    const matches = [
      makeMatch("A", ["2026-03-10"], { venue: "BFI" }),
      makeMatch("B", ["2026-03-10"], { venue: "Curzon" }),
    ];
    expect(applyDiscoveryFilters(matches, defaultOpts)).toHaveLength(2);
  });

  // ── Hide unreleased ───────────────────────────────────────────────────────

  it("hides coming-soon films when hideUnreleased is true", () => {
    const matches = [
      makeMatch("Coming", ["2026-04-01"], { releaseDate: "2026-04-01" }),
      makeMatch("Out", ["2026-04-01"], { releaseDate: "2025-01-01" }),
    ];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, hideUnreleased: true });
    expect(result).toHaveLength(1);
    expect(result[0].film.title).toBe("Out");
  });

  it("shows coming-soon films when hideUnreleased is false", () => {
    const matches = [
      makeMatch("Coming", ["2026-04-01"], { releaseDate: "2026-04-01" }),
      makeMatch("Out", ["2026-04-01"], { releaseDate: "2025-01-01" }),
    ];
    expect(applyDiscoveryFilters(matches, { ...defaultOpts, hideUnreleased: false })).toHaveLength(2);
  });

  // ── Sort modes ────────────────────────────────────────────────────────────

  it("sorts by soonest first (default)", () => {
    const matches = [makeMatch("Later", ["2026-03-20"]), makeMatch("Sooner", ["2026-03-05"])];
    const result = applyDiscoveryFilters(matches, defaultOpts);
    expect(result[0].film.title).toBe("Sooner");
    expect(result[1].film.title).toBe("Later");
  });

  it("sorts by title A–Z", () => {
    const matches = [makeMatch("Zebra", ["2026-03-10"]), makeMatch("Alien", ["2026-03-10"])];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, sortMode: "title_asc" });
    expect(result[0].film.title).toBe("Alien");
    expect(result[1].film.title).toBe("Zebra");
  });

  it("sorts by year, newest first", () => {
    const matches = [
      makeMatch("Old", ["2026-03-10"], { year: 1980 }),
      makeMatch("New", ["2026-03-10"], { year: 2024 }),
    ];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, sortMode: "year_desc" });
    expect(result[0].film.title).toBe("New");
    expect(result[1].film.title).toBe("Old");
  });

  it("sorts by rating, highest first", () => {
    const matches = [
      makeMatch("Low", ["2026-03-10"], { rating: 5.0 }),
      makeMatch("High", ["2026-03-10"], { rating: 8.5 }),
    ];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, sortMode: "rating_desc" });
    expect(result[0].film.title).toBe("High");
    expect(result[1].film.title).toBe("Low");
  });

  it("places unrated films last when sorting by rating", () => {
    const matches = [
      makeMatch("Unrated", ["2026-03-10"]),
      makeMatch("Rated", ["2026-03-10"], { rating: 7.0 }),
    ];
    const result = applyDiscoveryFilters(matches, { ...defaultOpts, sortMode: "rating_desc" });
    expect(result[0].film.title).toBe("Rated");
  });

  // ── Combined filters ──────────────────────────────────────────────────────

  it("applies search + sort together", () => {
    const matches = [
      makeMatch("Zebra Night", ["2026-03-10"]),
      makeMatch("Alien Night", ["2026-03-05"]),
      makeMatch("Other Film", ["2026-03-01"]),
    ];
    const result = applyDiscoveryFilters(matches, {
      ...defaultOpts,
      filmSearch: "night",
      sortMode: "title_asc",
    });
    expect(result).toHaveLength(2);
    expect(result[0].film.title).toBe("Alien Night");
    expect(result[1].film.title).toBe("Zebra Night");
  });
});
