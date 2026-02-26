import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const WHATS_ON_URL =
  "https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_600.TcsWebTab_601";
const BASE_URL = "https://cinelumiere.savoysystems.co.uk";
const CACHE_KEY = "cine-lumiere";
const VENUE = "Ciné Lumière";

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "Friday 6 Mar 2026" → "2026-03-06" */
function parseSavoyDate(text: string): string | null {
  const m = text.trim().match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (month === undefined) return null;
  const year = parseInt(m[3], 10);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function scrapeCineLumiere(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(WHATS_ON_URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Each film block: <div class="programmetype{ID} programme twelvecol">
  $("div.programme").each((_, el) => {
    const title = $(el).find("h2.subtitle.first a").first().text().trim();
    if (!title) return;

    // Date rows: <tr> containing <td class="PeformanceListDate">
    $(el)
      .find("tr")
      .each((_, row) => {
        const dateCell = $(row).find("td.PeformanceListDate");
        if (!dateCell.length) return;

        const date = parseSavoyDate(dateCell.text());
        if (!date) return;

        // Each showing: <span class="StartTimeAndStatus">
        $(row)
          .find("span.StartTimeAndStatus")
          .each((_, span) => {
            const statusText = $(span)
              .find("span.PerformanceStatusSmall")
              .text()
              .toLowerCase();

            // Skip past showings (closed for booking)
            if (statusText.includes("closed for booking")) return;

            const timeEl = $(span).find("a.Button");
            const time = timeEl.text().trim();
            if (!time) return;

            const href = timeEl.attr("href") ?? "";
            const bookingUrl = href
              ? href.startsWith("http")
                ? href
                : `${BASE_URL}/${href.replace(/^\/+/, "")}`
              : null;

            screenings.push({
              title,
              year: null,
              date,
              time,
              venue: VENUE,
              // Keep sold-out entries but without a booking URL
              bookingUrl: statusText.includes("sold out") ? null : bookingUrl,
              format: null,
            });
          });
      });
  });

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
