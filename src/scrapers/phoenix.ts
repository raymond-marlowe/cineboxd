import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// CMS listing page: carousel items link to DLL film pages via ?f=<id>
const CMS_URL = "https://phoenixcinema.co.uk/whats-on/";
// DLL base for building absolute booking URLs
const DLL_BASE = "https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/";
const CACHE_KEY = "phoenix";
const VENUE = "Phoenix Cinema";

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** "Thu 19 Feb" → "2026-02-19" */
function parseDate(text: string): string {
  const today = new Date();
  const match = text.trim().match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return today.toISOString().split("T")[0];
  const day = parseInt(match[1], 10);
  const month = MONTH_MAP[match[2]];
  if (month === undefined) return today.toISOString().split("T")[0];
  let year = today.getFullYear();
  if (month < today.getMonth()) year++;
  return new Date(year, month, day).toISOString().split("T")[0];
}

/** Scrape one film's detail page and return its screenings. */
async function scrapeFilm(filmId: string): Promise<Screening[]> {
  const url = `${DLL_BASE}WhatsOn?f=${filmId}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Title from the page <title> tag: "Phoenix Cinema | Film Title"
  const rawTitle = $("title").text().replace(/^Phoenix Cinema\s*\|\s*/i, "").trim();
  if (!rawTitle) return [];

  const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim() : rawTitle;

  const screenings: Screening[] = [];
  // Deduplicate perfs: the page renders performances twice (desktop/mobile)
  const seen = new Set<string>();

  // Performances: ul.performances > li.performance
  // Each li has: span.date, span.perf-time, a.button.booking[href]
  $("li.performance").each((_, li) => {
    const dateText = $(li).find("span.date").text().trim();
    const time = $(li).find("span.perf-time").text().trim();
    const relHref = $(li).find("a.booking").attr("href") || "";
    if (!dateText || !time) return;

    const bookingUrl = relHref ? DLL_BASE + relHref : null;
    if (bookingUrl && seen.has(bookingUrl)) return;
    if (bookingUrl) seen.add(bookingUrl);

    const date = parseDate(dateText);

    // Format: span.tag elements inside the li (e.g. "CC", "AD", "B", "R"); "SO" = sold out
    const tags = $(li)
      .find("span.tag")
      .map((_, t) => $(t).text().trim())
      .get()
      .filter((t) => t && t !== "SO");
    const format = tags.length > 0 ? tags.join(", ") : null;

    screenings.push({ title, year, date, time, venue: VENUE, bookingUrl, format });
  });

  return screenings;
}

export async function scrapePhoenix(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  // Step 1: collect all unique film IDs from the CMS what's-on page
  const cmsRes = await fetch(CMS_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  const cmsHtml = await cmsRes.text();
  const $ = cheerio.load(cmsHtml);

  const filmIds = new Set<string>();
  // CMS links: href="https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=336977"
  $('a[href*="?f="]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]f=(\d+)/);
    if (m) filmIds.add(m[1]);
  });

  if (filmIds.size === 0) {
    setCache(CACHE_KEY, []);
    return [];
  }

  // Step 2: fetch all film detail pages in parallel
  const perFilm = await Promise.allSettled(
    [...filmIds].map((id) => scrapeFilm(id))
  );

  const screenings = perFilm.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  setCache(CACHE_KEY, screenings);
  return screenings;
}
