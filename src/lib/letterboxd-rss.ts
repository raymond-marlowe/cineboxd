import * as cheerio from "cheerio";
import { WatchlistFilm } from "./types";
import { trackedFetch } from "./perf-debug";
import { IS_REDIS_CONFIGURED, redis } from "./redis";
import {
  WATCHLIST_CACHE_KEY_VERSION,
  WATCHLIST_REDIS_TTL_SECONDS,
} from "./constants";

export class LetterboxdError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
  }
}

export interface FailedWatchlistPage {
  pageNumber: number;
  url: string;
  reason: string;
}

export interface LetterboxdFetchStats {
  fetchMs: number;
  parseMs: number;
  pagesExpected: number;
  pagesFetched: number;
  pagesWithFilms: number;
  urlsFetched: string[];
  warnings: string[];
  failedPages: FailedWatchlistPage[];
}

const MAX_PAGE_FETCH_CONCURRENCY = 3;
const RETRY_DELAY_MS = 250;

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

function parseTotalPagesFromHtml(html: string): number {
  const $ = cheerio.load(html);
  let maxPage = 1;

  const selectors = [
    "li.paginate-page a",
    "a.paginate-page",
    'a[href*="/watchlist/page/"]',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const hrefMatch = href.match(/\/watchlist\/page\/(\d+)\/?/);
      const textMatch = ($(el).text() ?? "").trim().match(/^\d+$/);

      if (hrefMatch) {
        maxPage = Math.max(maxPage, Number(hrefMatch[1]));
      }
      if (textMatch) {
        maxPage = Math.max(maxPage, Number(textMatch[0]));
      }
    });
  }

  return Number.isFinite(maxPage) && maxPage > 0 ? maxPage : 1;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) return;
        results[current] = await worker(items[current]);
      }
    })
  );

  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWatchlistPage(
  url: string,
  stats?: LetterboxdFetchStats
): Promise<WatchlistFilm[]> {
  let res: Response;
  try {
    const fetchStart = Date.now();
    res = await trackedFetch(url);
    if (stats) {
      stats.fetchMs += Date.now() - fetchStart;
      stats.pagesFetched += 1;
      stats.urlsFetched.push(url);
    }
  } catch {
    throw new LetterboxdError("Failed to connect to Letterboxd", 502);
  }

  if (!res.ok) {
    throw new LetterboxdError("Failed to fetch watchlist from Letterboxd", 502);
  }

  const html = await res.text();
  const parseStart = Date.now();
  const films = parseFilmsFromHtml(html);
  if (stats) {
    stats.parseMs += Date.now() - parseStart;
  }

  return films;
}

async function fetchWatchlistPageWithRetry(
  pageNumber: number,
  url: string,
  stats?: LetterboxdFetchStats
): Promise<{ films: WatchlistFilm[]; failedPage: FailedWatchlistPage | null }> {
  try {
    const films = await fetchWatchlistPage(url, stats);
    return { films, failedPage: null };
  } catch {
    if (stats) {
      stats.warnings.push(`Retrying ${url} after initial failure`);
    }
    await delay(RETRY_DELAY_MS);
    try {
      const films = await fetchWatchlistPage(url, stats);
      return { films, failedPage: null };
    } catch (retryErr) {
      const message =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      const failedPage: FailedWatchlistPage = {
        pageNumber,
        url,
        reason: message,
      };
      if (stats) {
        stats.warnings.push(`Skipping ${url} after retry failure: ${message}`);
        stats.failedPages.push(failedPage);
      }
      return { films: [], failedPage };
    }
  }
}

export async function fetchWatchlistByUsername(
  username: string,
  stats?: LetterboxdFetchStats
): Promise<WatchlistFilm[]> {
  const sanitized = sanitizeUsername(username);
  if (!sanitized) {
    throw new LetterboxdError("Invalid username", 400);
  }

  const cacheKey = `watchlist:${WATCHLIST_CACHE_KEY_VERSION}:${sanitized}`;
  if (IS_REDIS_CONFIGURED) {
    try {
      const cached = await redis.get<WatchlistFilm[]>(cacheKey);
      if (Array.isArray(cached)) {
        return cached;
      }
    } catch {
      // Fallback to live fetch when cache is unavailable.
    }
  }

  const pageOneUrl = `https://letterboxd.com/${sanitized}/watchlist/`;

  let pageOneRes: Response;
  try {
    const fetchStart = Date.now();
    pageOneRes = await trackedFetch(pageOneUrl);
    if (stats) {
      stats.fetchMs += Date.now() - fetchStart;
      stats.pagesFetched += 1;
      stats.urlsFetched.push(pageOneUrl);
    }
  } catch {
    throw new LetterboxdError("Failed to connect to Letterboxd", 502);
  }

  if (pageOneRes.status === 404) {
    throw new LetterboxdError("Username not found on Letterboxd", 404);
  }
  if (!pageOneRes.ok) {
    throw new LetterboxdError("Failed to fetch watchlist from Letterboxd", 502);
  }

  const pageOneHtml = await pageOneRes.text();
  const pageOneParseStart = Date.now();
  const pageOneFilms = parseFilmsFromHtml(pageOneHtml);
  if (stats) {
    stats.parseMs += Date.now() - pageOneParseStart;
  }

  if (pageOneFilms.length === 0) {
    throw new LetterboxdError(
      "This user's watchlist is private or empty",
      403
    );
  }

  const totalPages = parseTotalPagesFromHtml(pageOneHtml);
  if (stats) {
    stats.pagesExpected = totalPages;
    stats.pagesWithFilms = 1;
  }

  const allFilms: WatchlistFilm[] = [...pageOneFilms];
  if (totalPages > 1) {
    const laterPages = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 2);
    const laterPageResults = await mapWithConcurrency(
      laterPages,
      Math.min(MAX_PAGE_FETCH_CONCURRENCY, 3),
      async (pageNumber) => {
        const url = `https://letterboxd.com/${sanitized}/watchlist/page/${pageNumber}/`;
        const { films, failedPage } = await fetchWatchlistPageWithRetry(
          pageNumber,
          url,
          stats
        );
        return { films, failedPage };
      }
    );

    for (const { films } of laterPageResults) {
      if (films.length === 0) {
        break;
      }
      allFilms.push(...films);
      if (stats) {
        stats.pagesWithFilms += 1;
      }
    }

    const failedPages = laterPageResults
      .map((result) => result.failedPage)
      .filter((value): value is FailedWatchlistPage => value !== null);

    if (failedPages.length > 0) {
      throw new LetterboxdError(
        "Could not fully fetch this Letterboxd watchlist. Please try again in a moment.",
        502,
        { failedPages }
      );
    }
  }

  if (IS_REDIS_CONFIGURED) {
    try {
      await redis.set(cacheKey, allFilms, { ex: WATCHLIST_REDIS_TTL_SECONDS });
    } catch {
      // Non-fatal: cached watchlist is an optimization only.
    }
  }

  return allFilms;
}
