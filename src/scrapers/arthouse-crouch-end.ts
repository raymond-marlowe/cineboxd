import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const PAGE_URL = "https://www.arthousecrouchend.co.uk/";
const CACHE_KEY = "arthouse-crouch-end";
const VENUE = "Arthouse Crouch End";

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse a date label like "Today", "Thu 19 Feb", "Fri 20 Feb" into YYYY-MM-DD.
 */
function parseDateLabel(label: string): string {
  const today = new Date();
  if (/today/i.test(label)) {
    return today.toISOString().split("T")[0];
  }
  // "Thu 19 Feb" → day=19, month=Feb
  const match = label.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return today.toISOString().split("T")[0];

  const day = parseInt(match[1], 10);
  const monthName = match[2];
  const month = MONTH_MAP[monthName];
  if (month === undefined) return today.toISOString().split("T")[0];

  let year = today.getFullYear();
  // If the parsed month is before the current month, it wraps to next year
  if (month < today.getMonth()) year++;

  const d = new Date(year, month, day);
  return d.toISOString().split("T")[0];
}

export async function scrapeArthousCrouchEnd(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // The schedule is rendered as CSS tabs:
  //   <div class="tabs">
  //     <label for="today">Today</label>
  //     <div class="tab"> ... <div class="programmeinfo"> ... </div> </div>
  //     <label for="Thu">Thu 19 Feb</label>
  //     <div class="tab"> ... </div>
  //   </div>
  const tabsEl = $("div.tabs").first();
  let currentDate: string | null = null;

  tabsEl.children().each((_, el) => {
    if (el.name === "label") {
      currentDate = parseDateLabel($(el).text().trim());
    } else if ($(el).hasClass("tab") && currentDate !== null) {
      const date = currentDate;

      $(el)
        .find(".programmeinfo")
        .each((_, prog) => {
          // Title: .show-title > a, with <span class="prog-cert"> stripped
          const titleAnchor = $(prog).find(".show-title > a").first();
          const rawTitle = titleAnchor
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .trim();
          if (!rawTitle) return;

          const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
          const title = yearMatch
            ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
            : rawTitle;

          // Bookings in .OpenForSale > a (available) and .SoldOut > a (sold out)
          $(prog)
            .find(".OpenForSale > a, .SoldOut > a")
            .each((_, booking) => {
              const linkText = $(booking).text().trim();
              // Times are in 24-hour format, e.g. "20:30RECORDED BEFORE A LIVE AUDIENCE"
              const timeMatch = linkText.match(/^(\d{2}:\d{2})/);
              if (!timeMatch) return;
              const time = timeMatch[1];

              const bookingUrl = $(booking).attr("href") || null;

              screenings.push({
                title,
                year,
                date,
                time,
                venue: VENUE,
                bookingUrl,
                format: null,
              });
            });
        });
    }
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
