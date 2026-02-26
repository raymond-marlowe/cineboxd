import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// Coldharbour Blue (Whirled Cinema) is a WordPress + The Events Calendar site.
// Each screening is its own WordPress event post rendered as a Flickity carousel
// card.  The page is fully server-rendered; no JS execution required.
// One card = one performance (same film may appear on multiple cards for
// separate screenings).
const SCREENINGS_URL = "https://www.coldharbourblue.com/screenings/";
const CACHE_KEY = "coldharbour-blue";
const VENUE = "Coldharbour Blue / Whirled Cinema";

/**
 * Parse "DD/MM/YY" → "YYYY-MM-DD".
 * The site uses 2-digit years (e.g. "01/03/26" → 2026-03-01).
 */
function parseDDMMYY(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = `20${m[3]}`;
  return `${year}-${month}-${day}`;
}

export async function scrapeColdharbourBlue(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(SCREENINGS_URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  $("div.slideshow-slide.movie").each((_, card) => {
    // Title
    const title = $(card).find("h2 a.title-link").first().text().trim();
    if (!title) return;

    // Date: <div class="date"><b>Date:</b> DD/MM/YY</div>
    const rawDate = $(card)
      .find("div.meta div.date")
      .text()
      .replace(/Date:/i, "")
      .trim();
    const date = parseDDMMYY(rawDate);
    if (!date) return;

    // Time: <div class="time"><b>Time:</b> HH:MM</div>
    const time = $(card)
      .find("div.meta div.time")
      .text()
      .replace(/Time:/i, "")
      .trim();
    if (!time) return;

    // Booking URL: first .button-secondary that is NOT the YouTube trailer link
    const bookingAnchor = $(card)
      .find("div.actions a.button-secondary")
      .filter((_, a) => !$(a).hasClass("popup-youtube"))
      .first();
    const bookingUrl = bookingAnchor.attr("href") ?? null;

    screenings.push({
      title,
      year: null,
      date,
      time,
      venue: VENUE,
      bookingUrl: bookingUrl || null,
      format: null,
    });
  });

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
