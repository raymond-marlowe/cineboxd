import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { parseWatchlistCsv, normalizeTitle } from "@/lib/csv-parser";
import {
  FailedWatchlistPage,
  fetchWatchlistByUsername,
  LetterboxdError,
  LetterboxdFetchStats,
} from "@/lib/letterboxd-rss";
import { matchFilms } from "@/lib/matcher";
import { scrapeAll } from "@/scrapers";
import { fetchFilmMetadata } from "@/lib/tmdb";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCached, setCacheWithTTL } from "@/lib/cache";
import {
  getPerfDebugSnapshot,
  isPerfDebugEnabled,
  withPerfDebugScope,
} from "@/lib/perf-debug";
import { WatchlistFilm, MatchedScreening, Screening } from "@/lib/types";
import { redis, SCREENINGS_KEY, SCREENINGS_UPDATED_KEY } from "@/lib/redis";

const SCREENINGS_TTL = 86400; // seconds

interface MatchDebugPayload {
  totalMs: number;
  watchlistFetchMs: number;
  watchlistParseMs: number;
  watchlistFilmCount: number;
  dedupedFilmCount: number;
  letterboxdPagesExpected: number;
  letterboxdPagesFetched: number;
  letterboxdUrlsFetchedCount: number;
  letterboxdUrlsSample: string[];
  letterboxdWarnings: string[];
  screeningsSource: "redis" | "live-scrape";
  screeningsLoadMs: number;
  tmdbCallsCount: number;
  tmdbMs: number;
  outboundFetchesByDomain: Record<string, number>;
}

interface ApiErrorShape {
  code: string;
  message: string;
  details: unknown | null;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: unknown = null,
  debug?: unknown
) {
  const body: { error: ApiErrorShape; debug?: unknown } = {
    error: { code, message, details },
  };
  if (debug !== undefined) {
    body.debug = debug;
  }
  return NextResponse.json(body, { status });
}

function getFailedWatchlistPages(err: unknown): FailedWatchlistPage[] {
  if (!(err instanceof LetterboxdError) || !err.details) {
    return [];
  }
  const maybe = (err.details as { failedPages?: unknown }).failedPages;
  if (!Array.isArray(maybe)) {
    return [];
  }
  return maybe.filter(
    (item): item is FailedWatchlistPage =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { pageNumber?: unknown }).pageNumber === "number" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { reason?: unknown }).reason === "string"
  );
}

function countDedupedFilms(films: WatchlistFilm[]): number {
  const keys = new Set(
    films.map((film) => `${normalizeTitle(film.title)}|${film.year ?? ""}`)
  );
  return keys.size;
}

/** Read screenings from Redis; fall back to a live scrape if the cache is empty. */
async function getScreenings(): Promise<{
  screenings: Screening[];
  source: "redis" | "live-scrape";
}> {
  const cached = await redis.get<Screening[]>(SCREENINGS_KEY);
  if (cached) {
    return { screenings: cached, source: "redis" };
  }
  console.warn("No cached screenings in Redis — falling back to live scrape");
  const screenings = await scrapeAll();
  await Promise.all([
    redis.set(SCREENINGS_KEY, screenings, { ex: SCREENINGS_TTL }),
    redis.set(SCREENINGS_UPDATED_KEY, new Date().toISOString()),
  ]);
  return { screenings, source: "live-scrape" };
}

const LIST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  // Rate limit check
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again shortly.",
          details: null,
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  const debugEnabled = isPerfDebugEnabled();
  const startedAt = Date.now();
  const shouldEnrich = new URL(request.url).searchParams.get("enrich") !== "0";

  return withPerfDebugScope(debugEnabled, async () => {
    try {
      let watchlist: WatchlistFilm[];
      let listId_: string | undefined;
      const debugState: MatchDebugPayload = {
        totalMs: 0,
        watchlistFetchMs: 0,
        watchlistParseMs: 0,
        watchlistFilmCount: 0,
        dedupedFilmCount: 0,
        letterboxdPagesExpected: 0,
        letterboxdPagesFetched: 0,
        letterboxdUrlsFetchedCount: 0,
        letterboxdUrlsSample: [],
        letterboxdWarnings: [],
        screeningsSource: "redis",
        screeningsLoadMs: 0,
        tmdbCallsCount: 0,
        tmdbMs: 0,
        outboundFetchesByDomain: {},
      };

      const contentType = request.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const body = await request.json();

        // Cached list flow
        if (typeof body.listId === "string") {
          const listId = body.listId;
          const cached = getCached<WatchlistFilm[]>("list-" + listId);
          if (!cached) {
            return errorResponse(
              410,
              "LIST_EXPIRED",
              "This shared link has expired",
              { expired: true }
            );
          }
          watchlist = cached;
          listId_ = listId;
        }
        // Multi-user flow
        else if (Array.isArray(body.usernames)) {
          return handleMultiUser(body.usernames, shouldEnrich, debugEnabled, startedAt);
        }
        // Single username flow
        else {
          const username = typeof body.username === "string" ? body.username.trim() : "";

          if (!username) {
            return errorResponse(400, "INVALID_USERNAME", "Please enter a username");
          }

          const letterboxdStats: LetterboxdFetchStats = {
            fetchMs: 0,
            parseMs: 0,
            pagesExpected: 0,
            pagesFetched: 0,
            pagesWithFilms: 0,
            urlsFetched: [],
            warnings: [],
            failedPages: [],
          };

          try {
            watchlist = await fetchWatchlistByUsername(username, letterboxdStats);
            if (debugEnabled) {
              debugState.watchlistFetchMs = letterboxdStats.fetchMs;
              debugState.watchlistParseMs = letterboxdStats.parseMs;
              debugState.letterboxdPagesExpected = letterboxdStats.pagesExpected;
              debugState.letterboxdPagesFetched = letterboxdStats.pagesFetched;
              debugState.letterboxdWarnings = letterboxdStats.warnings;
            }
          } catch (err) {
            if (err instanceof LetterboxdError) {
              if (debugEnabled) {
                const failedPages = getFailedWatchlistPages(err);
                return errorResponse(
                  err.statusCode,
                  "LETTERBOXD_FETCH_FAILED",
                  err.message,
                  { failedWatchlistPages: failedPages },
                  {
                    watchlistFetchMs: letterboxdStats.fetchMs,
                    watchlistParseMs: letterboxdStats.parseMs,
                    letterboxdPagesExpected: letterboxdStats.pagesExpected,
                    letterboxdPagesFetched: letterboxdStats.pagesFetched,
                    failedWatchlistPages: failedPages,
                    letterboxdWarnings: letterboxdStats.warnings,
                  }
                );
              }
              return errorResponse(
                err.statusCode,
                "LETTERBOXD_FETCH_FAILED",
                err.message,
                { failedWatchlistPages: getFailedWatchlistPages(err) }
              );
            }
            throw err;
          }
        }
      } else {
        // CSV upload flow
        const formData = await request.formData();
        const file = formData.get("csv") as File | null;

        if (!file) {
          return errorResponse(400, "CSV_MISSING", "No CSV file provided");
        }

        const csvText = await file.text();
        const parseStart = Date.now();
        watchlist = parseWatchlistCsv(csvText);
        if (debugEnabled) {
          debugState.watchlistParseMs = Date.now() - parseStart;
        }

        if (watchlist.length === 0) {
          return errorResponse(
            400,
            "CSV_EMPTY",
            "No films found in CSV. Make sure it's a Letterboxd watchlist export."
          );
        }

        // Cache the parsed watchlist with a shareable ID
        listId_ = crypto.randomBytes(4).toString("hex");
        setCacheWithTTL("list-" + listId_, watchlist, LIST_TTL_MS);
      }

      const screeningsLoadStart = Date.now();
      const { screenings, source: screeningsSource } = await getScreenings();
      if (debugEnabled) {
        debugState.screeningsSource = screeningsSource;
        debugState.screeningsLoadMs = Date.now() - screeningsLoadStart;
      }
      const matches = matchFilms(watchlist, screenings);
      if (debugEnabled) {
        debugState.watchlistFilmCount = watchlist.length;
        debugState.dedupedFilmCount = countDedupedFilms(watchlist);
      }

      const enriched = shouldEnrich && process.env.TMDB_API_KEY
        ? await Promise.all(
            matches.map(async (m) => ({
              ...m,
              metadata: await fetchFilmMetadata(m.film.title, m.film.year),
            }))
          )
        : matches;

      const response: {
        watchlistCount: number;
        screeningsScraped: number;
        matches: typeof enriched;
        listId?: string;
        debug?: MatchDebugPayload;
      } = {
        watchlistCount: watchlist.length,
        screeningsScraped: screenings.length,
        matches: enriched,
        ...(listId_ ? { listId: listId_ } : {}),
      };

      if (debugEnabled) {
        const perfSnapshot = getPerfDebugSnapshot();
        const letterboxdFetches = perfSnapshot["letterboxd.com"];
        const tmdbFetches = perfSnapshot["api.themoviedb.org"];

        debugState.totalMs = Date.now() - startedAt;
        debugState.letterboxdUrlsFetchedCount = letterboxdFetches?.count ?? 0;
        debugState.letterboxdUrlsSample = letterboxdFetches?.urls?.slice(0, 10) ?? [];
        debugState.tmdbCallsCount = tmdbFetches?.count ?? 0;
        debugState.tmdbMs = tmdbFetches?.totalMs ?? 0;
        debugState.outboundFetchesByDomain = Object.fromEntries(
          Object.entries(perfSnapshot).map(([domain, value]) => [domain, value.count])
        );

        response.debug = debugState;
        console.log("[match][debug]", JSON.stringify(debugState));
      }

      return NextResponse.json(response);
    } catch (err) {
      console.error("Match API error:", err);
      return errorResponse(500, "MATCH_FAILED", "Failed to process request");
    }
  });
}

async function handleMultiUser(
  rawUsernames: unknown[],
  shouldEnrich = true,
  debugEnabled = false,
  startedAt = Date.now()
) {
  // Validate: 2-5 non-empty trimmed usernames
  const usernames = rawUsernames
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (usernames.length < 2) {
    return errorResponse(400, "TOO_FEW_USERNAMES", "Please enter at least 2 usernames");
  }
  if (usernames.length > 5) {
    return errorResponse(400, "TOO_MANY_USERNAMES", "Maximum 5 usernames allowed");
  }

  // Fetch all watchlists in parallel
  const letterboxdStatsByUser = usernames.map<LetterboxdFetchStats>(() => ({
    fetchMs: 0,
    parseMs: 0,
    pagesExpected: 0,
    pagesFetched: 0,
    pagesWithFilms: 0,
    urlsFetched: [],
    warnings: [],
    failedPages: [],
  }));

  const results = await Promise.allSettled(
    usernames.map((u, index) =>
      fetchWatchlistByUsername(u, letterboxdStatsByUser[index])
    )
  );

  const userErrors: Record<string, string> = {};
  const userWatchlists = new Map<string, WatchlistFilm[]>();

  for (let i = 0; i < usernames.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      userWatchlists.set(usernames[i], result.value);
    } else {
      const err = result.reason;
      userErrors[usernames[i]] =
        err instanceof LetterboxdError
          ? err.message
          : "Failed to fetch watchlist";
    }
  }

  // If ALL users failed, return 400
  if (userWatchlists.size === 0) {
    return errorResponse(
      400,
      "NO_WATCHLISTS_FETCHED",
      "Could not fetch any watchlists",
      { userErrors }
    );
  }

  // Build Map<filmKey, Set<username>> and union watchlist
  const filmUsers = new Map<string, Set<string>>();
  const filmByKey = new Map<string, WatchlistFilm>();

  for (const [username, films] of userWatchlists) {
    for (const film of films) {
      const key = normalizeTitle(film.title) + "|" + (film.year ?? "");
      if (!filmUsers.has(key)) {
        filmUsers.set(key, new Set());
        filmByKey.set(key, film);
      }
      filmUsers.get(key)!.add(username);
    }
  }

  const unionWatchlist = Array.from(filmByKey.values());

  // Match against screenings
  const screeningsLoadStart = Date.now();
  const { screenings, source: screeningsSource } = await getScreenings();
  const screeningsLoadMs = Date.now() - screeningsLoadStart;
  const matches = matchFilms(unionWatchlist, screenings);

  // Annotate each match with users array
  const annotated: MatchedScreening[] = matches.map((m) => {
    const key = normalizeTitle(m.film.title) + "|" + (m.film.year ?? "");
    return { ...m, users: Array.from(filmUsers.get(key) ?? []) };
  });

  // Enrich with TMDB metadata
  const enriched = shouldEnrich && process.env.TMDB_API_KEY
    ? await Promise.all(
        annotated.map(async (m) => ({
          ...m,
          metadata: await fetchFilmMetadata(m.film.title, m.film.year),
        }))
      )
    : annotated;

  const response: {
    watchlistCount: number;
    screeningsScraped: number;
    matches: typeof enriched;
    userErrors?: Record<string, string>;
    totalUsers: number;
    debug?: MatchDebugPayload;
  } = {
    watchlistCount: unionWatchlist.length,
    screeningsScraped: screenings.length,
    matches: enriched,
    userErrors: Object.keys(userErrors).length > 0 ? userErrors : undefined,
    totalUsers: userWatchlists.size,
  };

  if (debugEnabled) {
    const perfSnapshot = getPerfDebugSnapshot();
    const letterboxdFetches = perfSnapshot["letterboxd.com"];
    const tmdbFetches = perfSnapshot["api.themoviedb.org"];

    const watchlistFetchMs = letterboxdStatsByUser.reduce(
      (sum, item) => sum + item.fetchMs,
      0
    );
    const watchlistParseMs = letterboxdStatsByUser.reduce(
      (sum, item) => sum + item.parseMs,
      0
    );
    const letterboxdPagesExpected = letterboxdStatsByUser.reduce(
      (sum, item) => sum + item.pagesExpected,
      0
    );
    const letterboxdPagesFetched = letterboxdStatsByUser.reduce(
      (sum, item) => sum + item.pagesFetched,
      0
    );

    const debugState: MatchDebugPayload = {
      totalMs: Date.now() - startedAt,
      watchlistFetchMs,
      watchlistParseMs,
      watchlistFilmCount: unionWatchlist.length,
      dedupedFilmCount: countDedupedFilms(unionWatchlist),
      letterboxdPagesExpected,
      letterboxdPagesFetched,
      letterboxdUrlsFetchedCount: letterboxdFetches?.count ?? 0,
      letterboxdUrlsSample: letterboxdFetches?.urls?.slice(0, 10) ?? [],
      letterboxdWarnings: letterboxdStatsByUser.flatMap((s) => s.warnings),
      screeningsSource,
      screeningsLoadMs,
      tmdbCallsCount: tmdbFetches?.count ?? 0,
      tmdbMs: tmdbFetches?.totalMs ?? 0,
      outboundFetchesByDomain: Object.fromEntries(
        Object.entries(perfSnapshot).map(([domain, value]) => [domain, value.count])
      ),
    };

    response.debug = debugState;
    console.log("[match][debug]", JSON.stringify(debugState));
  }

  return NextResponse.json(response);
}
