import type { MatchedScreening } from "./types";
import { VENUE_COORDS, distanceMiles, nearestVenueDistance } from "./venues";

export type SortMode =
  | "soonest" | "latest"
  | "title_asc" | "title_desc"
  | "year_desc" | "year_asc"
  | "rating_desc" | "rating_asc";

export interface DiscoveryOptions {
  sortMode: SortMode;
  filmSearch: string;
  hideUnreleased: boolean;
  venueFilter: string; // "all" or a venue name
  postcodeCoords: { lat: number; lng: number } | null;
  sortByDistance: boolean;
  maxDistanceMiles: number | null;
  today: string; // ISO YYYY-MM-DD
}

/** Returns "YYYY-MM-DDTHH:mm" for the earliest screening, or a far-future sentinel if none. */
export function getEarliestScreeningDate(match: MatchedScreening): string {
  if (match.screenings.length === 0) return "9999-12-31T23:59";
  return match.screenings.reduce((min, s) => {
    const dt = `${s.date}T${s.time}`;
    return dt < min ? dt : min;
  }, "9999-12-31T23:59");
}

/**
 * Returns true if the film has a known release date strictly after `today`.
 * Films with no releaseDate are treated as already released.
 */
export function isComingSoon(match: MatchedScreening, today: string): boolean {
  const rd = match.metadata?.releaseDate;
  if (!rd) return false;
  return rd > today;
}

export function applyDiscoveryFilters(
  matches: MatchedScreening[],
  opts: DiscoveryOptions
): MatchedScreening[] {
  // ── 1. Filter screenings within each match (venue + max distance) ─────────
  let result: MatchedScreening[] = matches
    .map((m) => {
      let screenings = m.screenings;

      if (opts.venueFilter !== "all") {
        screenings = screenings.filter((s) => s.venue === opts.venueFilter);
      }

      if (opts.postcodeCoords && opts.maxDistanceMiles !== null) {
        const { lat, lng } = opts.postcodeCoords;
        const maxMi = opts.maxDistanceMiles;
        screenings = screenings.filter((s) => {
          const vc = VENUE_COORDS[s.venue];
          if (!vc) return true; // unknown venue — keep
          return distanceMiles(lat, lng, vc.lat, vc.lng) <= maxMi;
        });
      }

      return { ...m, screenings };
    })
    .filter((m) => m.screenings.length > 0);

  // ── 2. Title search (case-insensitive substring) ──────────────────────────
  const q = opts.filmSearch.trim().toLowerCase();
  if (q) {
    result = result.filter((m) => m.film.title.toLowerCase().includes(q));
  }

  // ── 3. Hide unreleased ────────────────────────────────────────────────────
  if (opts.hideUnreleased) {
    result = result.filter((m) => !isComingSoon(m, opts.today));
  }

  // ── 4. Sort (primary: sortMode; secondary tie-breaker: distance) ──────────
  return [...result].sort((a, b) => {
    let cmp = 0;

    switch (opts.sortMode) {
      case "soonest":
        cmp = getEarliestScreeningDate(a).localeCompare(getEarliestScreeningDate(b));
        break;
      case "latest":
        cmp = getEarliestScreeningDate(b).localeCompare(getEarliestScreeningDate(a));
        break;
      case "title_asc":
        cmp = a.film.title.localeCompare(b.film.title);
        break;
      case "title_desc":
        cmp = b.film.title.localeCompare(a.film.title);
        break;
      case "year_desc":
        cmp = (b.film.year ?? 0) - (a.film.year ?? 0);
        break;
      case "year_asc":
        cmp = (a.film.year ?? 0) - (b.film.year ?? 0);
        break;
      case "rating_desc":
        cmp = (b.metadata?.tmdbRating ?? -1) - (a.metadata?.tmdbRating ?? -1);
        break;
      case "rating_asc":
        cmp = (a.metadata?.tmdbRating ?? -1) - (b.metadata?.tmdbRating ?? -1);
        break;
    }

    if (cmp !== 0) return cmp;

    // Distance tie-breaker
    if (opts.sortByDistance && opts.postcodeCoords) {
      return (
        nearestVenueDistance(a.screenings, opts.postcodeCoords.lat, opts.postcodeCoords.lng) -
        nearestVenueDistance(b.screenings, opts.postcodeCoords.lat, opts.postcodeCoords.lng)
      );
    }

    return 0;
  });
}
