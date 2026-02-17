import { FilmMetadata } from "./types";
import { getCached, setCache } from "./cache";

const TMDB_BASE = "https://api.themoviedb.org/3";

function cacheKey(title: string, year: number | null): string {
  const normalized = title.toLowerCase().trim();
  return `tmdb-${normalized}-${year ?? "unknown"}`;
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
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
    setCache(key, empty);
    return empty;
  }

  const movieId = searchData.results[0].id;
  const details = await tmdbFetch(`/movie/${movieId}`, {
    append_to_response: "credits",
  });

  if (!details) {
    setCache(key, empty);
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

  setCache(key, metadata);
  return metadata;
}
