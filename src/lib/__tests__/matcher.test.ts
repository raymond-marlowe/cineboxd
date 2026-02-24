import { describe, it, expect } from "vitest";
import { matchFilms } from "../matcher";
import { WatchlistFilm, Screening } from "../types";

// Minimal helpers to keep test data concise
const film = (title: string, year?: number, uri?: string): WatchlistFilm => ({
  title,
  year: year ?? null,
  letterboxdUri: uri ?? `https://letterboxd.com/film/${title.toLowerCase().replace(/\s+/g, "-")}/`,
});

const screening = (title: string, year?: number): Screening => ({
  title,
  year: year ?? null,
  date: "2026-03-01",
  time: "18:00",
  venue: "Test Cinema",
  bookingUrl: `https://example.com/book/${title}`,
  format: null,
});

// ---------------------------------------------------------------------------
// Single-token anti-collision ("Dreams" must not match "Train Dreams")
// ---------------------------------------------------------------------------
describe("single-token title matching", () => {
  it("'Dreams' does NOT match 'Train Dreams'", () => {
    const result = matchFilms(
      [film("Dreams")],
      [screening("Train Dreams"), screening("Magazine Dreams"), screening("Dreams")]
    );
    expect(result).toHaveLength(1);
    const match = result[0];
    expect(match.film.title).toBe("Dreams");
    // Only the exact "Dreams" screening should be present
    expect(match.screenings.every((s) => s.title === "Dreams")).toBe(true);
  });

  it("'Dreams' does NOT match 'Magazine Dreams'", () => {
    const result = matchFilms(
      [film("Dreams")],
      [screening("Magazine Dreams")]
    );
    expect(result).toHaveLength(0);
  });

  it("'Dreams' DOES match an exact 'Dreams' screening", () => {
    const result = matchFilms(
      [film("Dreams")],
      [screening("Dreams")]
    );
    expect(result).toHaveLength(1);
    expect(result[0].screenings).toHaveLength(1);
  });

  it("multi-token watchlist title still matches multi-token screening", () => {
    const result = matchFilms(
      [film("Wild Strawberries")],
      [screening("Wild Strawberries")]
    );
    expect(result).toHaveLength(1);
  });

  it("'Possession' does NOT fuzzy-match 'Obsession' via single-token guard", () => {
    // "possession" and "obsession" both have 1 significant token — but they differ,
    // so the 60% overlap check (not the single-token guard) should reject this.
    const result = matchFilms(
      [film("Possession")],
      [screening("Obsession")]
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate film cards regression
// ---------------------------------------------------------------------------
describe("watchlist deduplication", () => {
  it("same film appearing twice in watchlist yields only one result card", () => {
    const duplicate = film("Possession", 1981, "https://letterboxd.com/film/possession/");
    const result = matchFilms(
      [duplicate, duplicate],
      [screening("Possession", 1981)]
    );
    expect(result).toHaveLength(1);
  });

  it("same title+year but different letterboxdUri still deduplicates by URI", () => {
    const a = film("Possession", 1981, "https://letterboxd.com/film/possession/");
    const b: WatchlistFilm = { ...a, letterboxdUri: "https://letterboxd.com/film/possession/" };
    const result = matchFilms(
      [a, b],
      [screening("Possession", 1981)]
    );
    expect(result).toHaveLength(1);
  });

  it("genuinely distinct films with same title but different years both appear", () => {
    const a = film("Solaris", 1972, "https://letterboxd.com/film/solaris/");
    const b = film("Solaris", 2002, "https://letterboxd.com/film/solaris-2002/");
    const result = matchFilms(
      [a, b],
      [screening("Solaris", 1972), screening("Solaris", 2002)]
    );
    expect(result).toHaveLength(2);
  });

  it("no film title appears more than once in the result list", () => {
    // Regression: feeding an artificially duplicated watchlist must never produce
    // two MatchedScreening entries for the same film.
    const dupes = Array.from({ length: 5 }, () =>
      film("Wuthering Heights", 2025, "https://letterboxd.com/film/wuthering-heights-2025/")
    );
    const result = matchFilms(dupes, [screening("Wuthering Heights", 2025)]);
    const titles = result.map((r) => r.film.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(result).toHaveLength(1);
  });
});
