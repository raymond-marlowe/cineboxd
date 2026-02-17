import { NextRequest, NextResponse } from "next/server";
import { parseWatchlistCsv } from "@/lib/csv-parser";
import {
  fetchWatchlistByUsername,
  LetterboxdError,
} from "@/lib/letterboxd-rss";
import { matchFilms } from "@/lib/matcher";
import { scrapeAll } from "@/scrapers";
import { fetchFilmMetadata } from "@/lib/tmdb";
import { checkRateLimit } from "@/lib/rate-limit";
import { WatchlistFilm } from "@/lib/types";

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

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      // Username-based flow
      const body = await request.json();
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
    }

    const screenings = await scrapeAll();
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
    });
  } catch (err) {
    console.error("Match API error:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
