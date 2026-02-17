import * as cheerio from "cheerio";
import { WatchlistFilm } from "./types";

export class LetterboxdError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

function sanitizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function parseFilmsFromHtml(html: string): WatchlistFilm[] {
  const $ = cheerio.load(html);
  const films: WatchlistFilm[] = [];

  $('div[data-component-class="LazyPoster"]').each((_, el) => {
    const itemName = $(el).attr("data-item-name") ?? "";
    const targetLink = $(el).attr("data-target-link") ?? "";

    if (!itemName) return;

    // data-item-name format: "Film Title (2024)"
    const yearMatch = itemName.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const title = yearMatch
      ? itemName.slice(0, itemName.lastIndexOf(`(${yearMatch[1]})`)).trim()
      : itemName.trim();

    const letterboxdUri = targetLink
      ? `https://letterboxd.com${targetLink}`
      : "";

    films.push({ title, year, letterboxdUri });
  });

  return films;
}

export async function fetchWatchlistByUsername(
  username: string
): Promise<WatchlistFilm[]> {
  const sanitized = sanitizeUsername(username);
  if (!sanitized) {
    throw new LetterboxdError("Invalid username", 400);
  }

  const allFilms: WatchlistFilm[] = [];
  let page = 1;

  while (true) {
    const url =
      page === 1
        ? `https://letterboxd.com/${sanitized}/watchlist/`
        : `https://letterboxd.com/${sanitized}/watchlist/page/${page}/`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new LetterboxdError("Failed to connect to Letterboxd", 502);
    }

    if (res.status === 404) {
      throw new LetterboxdError("Username not found on Letterboxd", 404);
    }

    if (!res.ok) {
      throw new LetterboxdError("Failed to fetch watchlist from Letterboxd", 502);
    }

    const html = await res.text();
    const films = parseFilmsFromHtml(html);

    if (films.length === 0) {
      if (page === 1) {
        throw new LetterboxdError(
          "This user's watchlist is private or empty",
          403
        );
      }
      break;
    }

    allFilms.push(...films);
    page++;
  }

  return allFilms;
}
