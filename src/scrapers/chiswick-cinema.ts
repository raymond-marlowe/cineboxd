import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const BASE_URL = "https://www.chiswickcinema.co.uk";
const WHATS_ON_URL = `${BASE_URL}/whats-on`;
const CACHE_KEY = "chiswick-cinema";
const VENUE = "Chiswick Cinema";
const LOOKAHEAD_DAYS = 60;
const MAX_SCREENINGS = 120;
const MAX_MOVIES = 60;

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return null;
  }
}

function splitTitleAndYear(raw: string): { title: string; year: number | null } {
  const text = normalizeSpaces(raw);
  const m = text.match(/\((\d{4})\)\s*$/);
  if (!m) return { title: text, year: null };
  return {
    title: text.replace(/\s*\(\d{4}\)\s*$/, "").trim(),
    year: parseInt(m[1], 10),
  };
}

function parseDateTimeLabel(label: string, now: Date): { date: string; time: string } | null {
  const m = normalizeSpaces(label).match(
    /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(m[2], 10);
  let hour = parseInt(m[3], 10);
  const minute = parseInt(m[4] ?? "0", 10);
  const period = m[5].toLowerCase();

  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  let year = now.getFullYear();
  let dt = new Date(year, month, day, hour, minute, 0, 0);
  if (dt.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
    year += 1;
    dt = new Date(year, month, day, hour, minute, 0, 0);
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);
  const dayOnly = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (dayOnly < start || dayOnly > end) return null;

  const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
  const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(
    2,
    "0"
  )}`;
  return { date, time };
}

function extractMovieLinks(html: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href*="/movie/"]').each((_, a) => {
    const href = absUrl($(a).attr("href"));
    if (!href) return;
    links.add(href.split("#")[0].split("?")[0]);
  });

  // Backup extraction for client-rendered pages with inline link payloads.
  const source = html.replace(/\\\//g, "/");
  const rx = /(?:https?:\/\/www\.chiswickcinema\.co\.uk)?\/movie\/[a-z0-9-]+\/?/gi;
  for (const m of source.match(rx) ?? []) {
    const href = absUrl(m);
    if (!href) continue;
    links.add(href.split("#")[0].split("?")[0]);
  }

  return [...links];
}

function addJsonLdScreenings(
  html: string,
  title: string,
  year: number | null,
  now: Date,
  seen: Set<string>,
  out: Screening[]
): void {
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((_, script) => {
    const raw = $(script).contents().text().trim();
    if (!raw) return;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const nodes = Array.isArray(payload) ? payload : [payload];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const event = node as { startDate?: unknown; url?: unknown };
      if (typeof event.startDate !== "string") continue;

      const dt = new Date(event.startDate);
      if (Number.isNaN(dt.getTime())) continue;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + LOOKAHEAD_DAYS);
      const dayOnly = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      if (dayOnly < start || dayOnly > end) continue;

      const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
        dt.getDate()
      ).padStart(2, "0")}`;
      const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(
        2,
        "0"
      )}`;
      const bookingUrl = typeof event.url === "string" ? absUrl(event.url) : null;
      const key = bookingUrl ?? `${title}|${date}|${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, year, date, time, venue: VENUE, bookingUrl, format: null });
    }
  });
}

async function scrapeMoviePage(url: string, now: Date): Promise<Screening[]> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);

  const pageTitle =
    normalizeSpaces($("h1").first().text()) ||
    normalizeSpaces($("title").text().replace(/\s*\|\s*Chiswick Cinema.*$/i, ""));
  if (!pageTitle) return [];

  const { title, year } = splitTitleAndYear(pageTitle);
  const seen = new Set<string>();
  const screenings: Screening[] = [];

  $('a[href*="/checkout/showing/"]').each((_, a) => {
    const bookingUrl = absUrl($(a).attr("href"));
    const parsed = parseDateTimeLabel($(a).text(), now);
    if (!parsed) return;

    const key = bookingUrl ?? `${title}|${parsed.date}|${parsed.time}`;
    if (seen.has(key)) return;
    seen.add(key);

    screenings.push({
      title,
      year,
      date: parsed.date,
      time: parsed.time,
      venue: VENUE,
      bookingUrl,
      format: null,
    });
  });

  if (screenings.length === 0) {
    addJsonLdScreenings(html, title, year, now, seen, screenings);
  }

  return screenings;
}

export async function scrapeChiswickCinema(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const now = new Date();
    const res = await fetch(WHATS_ON_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.error(`[chiswick-cinema] failed to fetch listings page: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const movieUrls = extractMovieLinks(html).slice(0, MAX_MOVIES);
    if (movieUrls.length === 0) {
      console.error("[chiswick-cinema] no movie links found on listings page");
      return [];
    }

    const perMovie = await Promise.allSettled(movieUrls.map((url) => scrapeMoviePage(url, now)));
    const screenings: Screening[] = [];
    const seen = new Set<string>();

    for (const r of perMovie) {
      if (r.status !== "fulfilled") continue;
      for (const s of r.value) {
        const key = s.bookingUrl ?? `${s.title}|${s.date}|${s.time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        screenings.push(s);
        if (screenings.length >= MAX_SCREENINGS) break;
      }
      if (screenings.length >= MAX_SCREENINGS) break;
    }

    setCache(CACHE_KEY, screenings);
    return screenings;
  } catch (err) {
    console.error("[chiswick-cinema] scraper error:", err);
    return [];
  }
}
