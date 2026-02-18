import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const LISTING_URL = "https://richmix.org.uk/whats-on/cinema/";
const BASE_URL = "https://richmix.org.uk";
const CACHE_KEY = "rich-mix";
const VENUE = "Rich Mix";

// Rich Mix is a WordPress site with Spektrix ticketing.
// Two-pass scrape:
//   Pass 1 (listing): https://richmix.org.uk/whats-on/cinema/
//     Selector: div.tease.tease-cinema  → film cards
//     Title:    header h3 a             (text + href to film detail page)
//   Pass 2 (per film): https://richmix.org.uk/cinema/{slug}/
//     Date:     div#dates-and-times div.day div.weekday  (text: "tomorrow" | "Fri 20 Feb")
//     Time+URL: div.times a.time                         (text: "5.40pm", href: /book-online/{id})
//   Booking URL: BASE_URL + a.time[href]

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Parse weekday label to YYYY-MM-DD.
// Observed values: "tomorrow", "Fri 20 Feb", "Sun 22 Feb", "Mon 23 Feb" …
function parseWeekdayDate(text: string): string {
  const t = text.trim();
  if (/today/i.test(t)) return new Date().toISOString().split("T")[0];
  if (/tomorrow/i.test(t)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const match = t.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = MONTHS[match[2]];
    if (month !== undefined) {
      const today = new Date();
      let year = today.getFullYear();
      // If this month has already passed, the screening must be next year
      if (
        month < today.getMonth() ||
        (month === today.getMonth() && day < today.getDate() - 7)
      ) {
        year++;
      }
      return new Date(year, month, day).toISOString().split("T")[0];
    }
  }
  return new Date().toISOString().split("T")[0];
}

// Parse "5.40pm" or "10.00am" → "17:40" / "10:00"
function parseTime(text: string): string {
  const match = text.trim().match(/(\d{1,2})\.(\d{2})\s*(am|pm)/i);
  if (!match) return text.trim();
  let h = parseInt(match[1], 10);
  const m = match[2];
  const p = match[3].toLowerCase();
  if (p === "pm" && h !== 12) h += 12;
  if (p === "am" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${m}`;
}

async function scrapeFilmPage(
  filmUrl: string,
  title: string,
  year: number | null
): Promise<Screening[]> {
  const res = await fetch(filmUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // div#dates-and-times contains all visible + collapsed day blocks
  $("#dates-and-times div.day").each((_, dayEl) => {
    const dateText = $(dayEl).find("div.weekday").first().text();
    if (!dateText.trim()) return;
    const date = parseWeekdayDate(dateText);

    $(dayEl)
      .find("div.times a.time")
      .each((_, timeEl) => {
        const timeText = $(timeEl).text().trim();
        if (!timeText) return;
        const time = parseTime(timeText);
        const href = $(timeEl).attr("href") || "";
        const bookingUrl = href ? BASE_URL + href : null;
        screenings.push({ title, year, date, time, venue: VENUE, bookingUrl, format: null });
      });
  });

  return screenings;
}

export async function scrapeRichMix(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  // Pass 1: listing page → film cards
  const listRes = await fetch(LISTING_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const listHtml = await listRes.text();
  const $ = cheerio.load(listHtml);

  const films: { url: string; title: string; year: number | null }[] = [];
  $("div.tease.tease-cinema").each((_, el) => {
    const titleEl = $(el).find("header h3 a").first();
    const rawTitle = titleEl.text().trim();
    if (!rawTitle) return;
    const filmUrl =
      titleEl.attr("href") ||
      $(el).find("div.post-image a").attr("href") ||
      "";
    if (!filmUrl) return;
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const title = yearMatch
      ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
      : rawTitle;
    films.push({ url: filmUrl, title, year });
  });

  // Pass 2: individual film pages for per-screening times and booking URLs
  const results = await Promise.allSettled(
    films.map((f) => scrapeFilmPage(f.url, f.title, f.year))
  );
  const screenings = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  setCache(CACHE_KEY, screenings);
  return screenings;
}
