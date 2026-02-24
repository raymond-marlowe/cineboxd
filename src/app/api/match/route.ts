import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { parseWatchlistCsv, normalizeTitle } from "@/lib/csv-parser";
import {
  fetchWatchlistByUsername,
  LetterboxdError,
} from "@/lib/letterboxd-rss";
import { matchFilms } from "@/lib/matcher";
import { scrapeAll } from "@/scrapers";
import { fetchFilmMetadata } from "@/lib/tmdb";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCached, setCacheWithTTL } from "@/lib/cache";
import { WatchlistFilm, MatchedScreening, Screening } from "@/lib/types";
import { redis, SCREENINGS_KEY, SCREENINGS_UPDATED_KEY } from "@/lib/redis";

const SCREENINGS_TTL = 86400; // seconds

/** Read screenings from Redis; fall back to a live scrape if the cache is empty. */
async function getScreenings(): Promise<Screening[]> {
  const cached = await redis.get<Screening[]>(SCREENINGS_KEY);
  if (cached) {
    return cached;
  }
  console.warn("No cached screenings in Redis — falling back to live scrape");
  const screenings = await scrapeAll();
  await Promise.all([
    redis.set(SCREENINGS_KEY, screenings, { ex: SCREENINGS_TTL }),
    redis.set(SCREENINGS_UPDATED_KEY, new Date().toISOString()),
  ]);
  return screenings;
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
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    let watchlist: WatchlistFilm[];
    let listId_: string | undefined;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();

      // Cached list flow
      if (typeof body.listId === "string") {
        const listId = body.listId;
        const cached = getCached<WatchlistFilm[]>("list-" + listId);
        if (!cached) {
          return NextResponse.json(
            { error: "This shared link has expired", expired: true },
            { status: 410 }
          );
        }
        watchlist = cached;
        listId_ = listId;
      }
      // Multi-user flow
      else if (Array.isArray(body.usernames)) {
        return handleMultiUser(body.usernames);
      }
      // Single username flow
      else {
        const username = typeof body.username === "string" ? body.username.trim() : "";

        if (!username) {
          return NextResponse.json(
            { error: "Please enter a username" },
            { status: 400 }
          );
        }

        try {
          watchlist = await fetchWatchlistByUsername(username);
        } catch (err) {
          if (err instanceof LetterboxdError) {
            return NextResponse.json(
              { error: err.message },
              { status: err.statusCode }
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
        return NextResponse.json(
          { error: "No CSV file provided" },
          { status: 400 }
        );
      }

      const csvText = await file.text();
      watchlist = parseWatchlistCsv(csvText);

      if (watchlist.length === 0) {
        return NextResponse.json(
          {
            error:
              "No films found in CSV. Make sure it's a Letterboxd watchlist export.",
          },
          { status: 400 }
        );
      }

      // Cache the parsed watchlist with a shareable ID
      listId_ = crypto.randomBytes(4).toString("hex");
      setCacheWithTTL("list-" + listId_, watchlist, LIST_TTL_MS);
    }

    const screenings = await getScreenings();
    const matches = matchFilms(watchlist, screenings);

    const enriched = process.env.TMDB_API_KEY
      ? await Promise.all(
          matches.map(async (m) => ({
            ...m,
            metadata: await fetchFilmMetadata(m.film.title, m.film.year),
          }))
        )
      : matches;

    return NextResponse.json({
      watchlistCount: watchlist.length,
      screeningsScraped: screenings.length,
      matches: enriched,
      ...(listId_ ? { listId: listId_ } : {}),
    });
  } catch (err) {
    console.error("Match API error:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function handleMultiUser(rawUsernames: unknown[]) {
  // Validate: 2-5 non-empty trimmed usernames
  const usernames = rawUsernames
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (usernames.length < 2) {
    return NextResponse.json(
      { error: "Please enter at least 2 usernames" },
      { status: 400 }
    );
  }
  if (usernames.length > 5) {
    return NextResponse.json(
      { error: "Maximum 5 usernames allowed" },
      { status: 400 }
    );
  }

  // Fetch all watchlists in parallel
  const results = await Promise.allSettled(
    usernames.map((u) => fetchWatchlistByUsername(u))
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
    return NextResponse.json(
      { error: "Could not fetch any watchlists", userErrors },
      { status: 400 }
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
  const screenings = await getScreenings();
  const matches = matchFilms(unionWatchlist, screenings);

  // Annotate each match with users array
  const annotated: MatchedScreening[] = matches.map((m) => {
    const key = normalizeTitle(m.film.title) + "|" + (m.film.year ?? "");
    return { ...m, users: Array.from(filmUsers.get(key) ?? []) };
  });

  // Enrich with TMDB metadata
  const enriched = process.env.TMDB_API_KEY
    ? await Promise.all(
        annotated.map(async (m) => ({
          ...m,
          metadata: await fetchFilmMetadata(m.film.title, m.film.year),
        }))
      )
    : annotated;

  return NextResponse.json({
    watchlistCount: unionWatchlist.length,
    screeningsScraped: screenings.length,
    matches: enriched,
    userErrors: Object.keys(userErrors).length > 0 ? userErrors : undefined,
    totalUsers: userWatchlists.size,
  });
}
