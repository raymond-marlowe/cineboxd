import { FilmMetadata } from "./types";
import { getCached, setCacheWithTTL } from "./cache";
import { trackedFetch } from "./perf-debug";
import { TMDB_CACHE_KEY_VERSION, TMDB_METADATA_CACHE_TTL_MS } from "./constants";

const TMDB_BASE = "https://api.themoviedb.org/3";

function cacheKey(title: string, year: number | null): string {
  const normalized = title.toLowerCase().trim();
  return `tmdb:${TMDB_CACHE_KEY_VERSION}:${normalized}:${year ?? "unknown"}`;
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await trackedFetch(url.toString());
  if (!res.ok) return null;
  return res.json();
}

export async function fetchFilmMetadata(
  title: string,
  year: number | null
): Promise<FilmMetadata> {
  const key = cacheKey(title, year);
  const cached = getCached<FilmMetadata>(key);
  if (cached) return cached;

  const empty: FilmMetadata = {
    posterPath: null,
    overview: null,
    director: null,
    tmdbRating: null,
    imdbId: null,
  };

  const searchParams: Record<string, string> = { query: title };
  if (year) searchParams.year = String(year);

  const searchData = await tmdbFetch("/search/movie", searchParams);
  if (!searchData?.results?.length) {
    setCacheWithTTL(key, empty, TMDB_METADATA_CACHE_TTL_MS);
    return empty;
  }

  const movieId = searchData.results[0].id;
  const details = await tmdbFetch(`/movie/${movieId}`, {
    append_to_response: "credits",
  });

  if (!details) {
    setCacheWithTTL(key, empty, TMDB_METADATA_CACHE_TTL_MS);
    return empty;
  }

  const director =
    details.credits?.crew?.find(
      (c: { job: string; name: string }) => c.job === "Director"
    )?.name ?? null;

  const metadata: FilmMetadata = {
    posterPath: details.poster_path ?? null,
    overview: details.overview || null,
    director,
    tmdbRating: details.vote_average ?? null,
    imdbId: details.imdb_id || null,
  };

  setCacheWithTTL(key, metadata, TMDB_METADATA_CACHE_TTL_MS);
  return metadata;
}
