import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// The Castle Cinema calendar is fully server-rendered — one GET returns every
// upcoming screening (today through ~Oct 2026) in a flat chronological list.
// No pagination, no JS execution required.
const CALENDAR_URL = "https://thecastlecinema.com/calendar/";
const BASE_URL = "https://thecastlecinema.com";
const CACHE_KEY = "castle-cinema";
const VENUE = "The Castle Cinema";

export async function scrapeCastleCinema(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(CALENDAR_URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // #slim-tiles contains h3.date siblings interspersed with div.programme-tile elements.
  // We walk children in order, carrying the current date forward from each h3.
  // h3.date format: "Thu, 26 Feb" — but data-start-time on each performance button
  // gives us a full ISO datetime, so we use that directly instead.
  $("#slim-tiles")
    .children()
    .each((_, el) => {
      if (!$(el).hasClass("programme-tile")) return;

      const title = $(el).find("h1.ellipse").first().text().trim();
      if (!title) return;

      $(el)
        .find("a.performance-button")
        .each((_, btn) => {
          const startTime = $(btn).attr("data-start-time"); // "2026-02-26T16:00:00"
          if (!startTime) return;

          const date = startTime.slice(0, 10);  // "2026-02-26"
          const time = startTime.slice(11, 16); // "16:00"

          const href = $(btn).attr("href") ?? "";
          const bookingUrl = href
            ? href.startsWith("http")
              ? href
              : `${BASE_URL}${href}`
            : null;

          // off-sale inactive = sold out / booking closed; keep the listing but
          // null the booking URL so the UI shows it without a book link.
          const isOffSale = $(btn).hasClass("off-sale") && $(btn).hasClass("inactive");

          screenings.push({
            title,
            year: null,
            date,
            time,
            venue: VENUE,
            bookingUrl: isOffSale ? null : bookingUrl,
            format: null,
          });
        });
    });

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
