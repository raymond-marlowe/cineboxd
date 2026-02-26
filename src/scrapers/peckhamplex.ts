import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// Peckhamplex listings are JS-rendered on the main page, but the data is
// served as a raw HTML fragment from a public API endpoint — no auth, no
// cookies, no headless browser required.
const LISTINGS_API = "https://www.peckhamplex.london/api/v1/films/listings/days";
const CACHE_KEY = "peckhamplex";
const VENUE = "Peckhamplex";

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse "Thursday 26th February 2026" → "2026-02-26".
 * The ordinal suffix (st/nd/rd/th) is stripped before parsing.
 */
function parseFullDate(text: string): string | null {
  // Strip ordinal suffix from the day number
  const cleaned = text.trim().replace(/(\d+)(?:st|nd|rd|th)/i, "$1");
  // Match: optional weekday, day, month name, year
  const m = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (month === undefined) return null;
  const year = parseInt(m[3], 10);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function scrapePeckhamplex(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(LISTINGS_API);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Each day section: <div class="films-listings">
  //   <h3>Thursday 26th February 2026</h3>
  //   <div class="film-day-wrapper">
  //     <div class="film-title-wrapper"> ... </div>
  //   </div>
  // </div>
  $("div.films-listings").each((_, section) => {
    const dateText = $(section).find("h3").first().text().trim();
    const date = parseFullDate(dateText);
    if (!date) return;

    $(section)
      .find("div.film-title-wrapper")
      .each((_, filmEl) => {
        const title = $(filmEl).find("div.title").first().text().trim();
        if (!title) return;

        // Each time slot is an <a class="btn btn-info"> with the time as text
        // and a direct Veezi booking link as href.
        // Special screenings (Hard of Hearing, Autism Friendly) carry a title
        // attribute; we surface that as the format field.
        $(filmEl)
          .find("a.btn.btn-info")
          .each((_, btn) => {
            // Extract HH:MM — the element may contain icon spans for special
            // screenings so we match the time portion explicitly.
            const rawText = $(btn).text();
            const timeMatch = rawText.match(/\d{1,2}:\d{2}/);
            if (!timeMatch) return;
            const time = timeMatch[0];

            const bookingUrl = $(btn).attr("href") ?? null;

            // Special screening label from the title attribute, if present
            const specialTitle = $(btn).attr("title")?.trim() ?? "";
            const format = specialTitle && specialTitle !== title
              ? specialTitle
              : null;

            screenings.push({
              title,
              year: null,
              date,
              time,
              venue: VENUE,
              bookingUrl: bookingUrl || null,
              format,
            });
          });
      });
  });

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
