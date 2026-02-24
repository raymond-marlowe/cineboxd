import Fuse from "fuse.js";
import { WatchlistFilm, Screening, MatchedScreening } from "./types";
import { normalizeTitle } from "./csv-parser";

/**
 * Check that significant words in the film title actually appear in the
 * screening title (or vice-versa). This prevents false positives like
 * "White Nights" matching "Boogie Nights" — they share "nights" but
 * the distinctive word is completely different.
 *
 * Returns true if ≥60% of the significant tokens overlap.
 */
function hasSufficientTokenOverlap(a: string, b: string): boolean {
  const stop = new Set([
    "the", "a", "an", "of", "and", "in", "at", "to", "for", "is", "on",
  ]);
  const tokensA = normalizeTitle(a).split(/\s+/).filter((t) => t.length > 0 && !stop.has(t));
  const tokensB = normalizeTitle(b).split(/\s+/).filter((t) => t.length > 0 && !stop.has(t));

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Guard: if either title is a single significant token, both must be single-token.
  // Prevents e.g. "Dreams" fuzzy-matching "Train Dreams" or "Magazine Dreams".
  if (Math.min(tokensA.length, tokensB.length) === 1 && tokensA.length !== tokensB.length) {
    return false;
  }

  // Use the shorter list as reference — all its tokens should appear in the longer
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  const hits = shorter.filter((t) => longerSet.has(t)).length;

  return hits / shorter.length >= 0.6;
}

export function matchFilms(
  watchlist: WatchlistFilm[],
  screenings: Screening[]
): MatchedScreening[] {
  if (screenings.length === 0 || watchlist.length === 0) return [];

  // Deduplicate watchlist: letterboxdUri is the stable primary key; fall back to
  // normalised title+year. Prevents duplicate film cards when the same entry
  // appears more than once (e.g. re-exported CSV, RSS quirk, shared-list merge).
  const seenFilms = new Set<string>();
  const uniqueWatchlist: WatchlistFilm[] = [];
  for (const film of watchlist) {
    const key = film.letterboxdUri
      ? film.letterboxdUri
      : normalizeTitle(film.title) + "|" + (film.year ?? "");
    if (!seenFilms.has(key)) {
      seenFilms.add(key);
      uniqueWatchlist.push(film);
    }
  }

  // Build index for exact normalized-title matches
  const screeningsByNorm = new Map<string, Screening[]>();
  for (const s of screenings) {
    const norm = normalizeTitle(s.title);
    if (!screeningsByNorm.has(norm)) screeningsByNorm.set(norm, []);
    screeningsByNorm.get(norm)!.push(s);
  }

  // Fuse.js for fuzzy fallback — threshold tightened from 0.3 → 0.15
  const fuse = new Fuse(screenings, {
    keys: ["title"],
    threshold: 0.15,
    includeScore: true,
    getFn: (obj, path) => {
      const key = Array.isArray(path) ? path[0] : path;
      if (key === "title") return normalizeTitle(obj.title);
      return "";
    },
  });

  const matched: MatchedScreening[] = [];

  for (const film of uniqueWatchlist) {
    const normTitle = normalizeTitle(film.title);
    // TEMP DEBUG — remove once Train Dreams matching is confirmed working
    const _debug = normTitle === "train dreams";

    // 1) Try exact match on normalized title first
    let matchedScreenings = screeningsByNorm.get(normTitle) ?? [];

    if (_debug) {
      console.log(`[matcher:debug] "${film.title}" (year=${film.year}) exact-map hit: ${matchedScreenings.length}`);
    }

    // 2) If no exact match, fall back to fuzzy with strict threshold + token check
    if (matchedScreenings.length === 0) {
      const fuzzyHits = fuse.search(normTitle);
      if (_debug) {
        console.log(`[matcher:debug] top-5 fuzzy candidates for "${film.title}":`);
        for (const r of fuzzyHits.slice(0, 5)) {
          const overlap = hasSufficientTokenOverlap(film.title, r.item.title);
          console.log(
            `  score=${r.score?.toFixed(4)} title="${r.item.title}" year=${r.item.year} overlap=${overlap}`
          );
        }
      }
      matchedScreenings = fuzzyHits
        .filter((r) => hasSufficientTokenOverlap(film.title, r.item.title))
        .map((r) => r.item);
    }

    // 3) Filter by year when both sides have one
    matchedScreenings = matchedScreenings.filter((s) => {
      const drop = !!(film.year && s.year && film.year !== s.year);
      if (_debug && drop) {
        console.log(`[matcher:debug] year-drop "${s.title}" watchlist=${film.year} screening=${s.year}`);
      }
      return !drop;
    });

    if (matchedScreenings.length > 0) {
      matchedScreenings.sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date);
        if (dateComp !== 0) return dateComp;
        return a.time.localeCompare(b.time);
      });

      matched.push({ film, screenings: matchedScreenings });
    }
  }

  return matched;
}
