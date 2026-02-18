import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// Homepage doubles as the full what's-on schedule
const PAGE_URL = "https://thegardencinema.co.uk/";
const CACHE_KEY = "garden";
const VENUE = "Garden Cinema";

export async function scrapeGarden(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(PAGE_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Date blocks: .date-block[data-date="YYYY-MM-DD"]
  $(".date-block[data-date]").each((_, dateBlock) => {
    const date = $(dateBlock).attr("data-date");
    if (!date) return;

    // Each film in this date block: .films-list__by-date__film
    $(dateBlock)
      .find(".films-list__by-date__film")
      .each((_, filmEl) => {
        // Title: h1.films-list__by-date__film__title (strip child rating span)
        const titleEl = $(filmEl).find("h1.films-list__by-date__film__title").first();
        const rawTitle = titleEl
          .clone()
          .find("span")
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

        // Each screening: .screening-panel contains date label + time anchor
        $(filmEl)
          .find(".screening-panel")
          .each((_, panel) => {
            // Time + booking URL: span.screening-time > a.screening
            const anchor = $(panel).find("span.screening-time > a.screening").first();
            const time = anchor.text().trim();
            const bookingUrl = anchor.attr("href") || null;
            if (!time) return;

            // Format tags: span.screening-tag elements carry CSS classes like
            // "screening-tag ext-audio_description", "screening-tag ext-intro"
            const formatParts = $(panel)
              .find("[class*='screening-tag']")
              .map((_, t) => {
                const cls = $(t).attr("class") || "";
                // Extract the meaningful part after "ext-"
                const m = cls.match(/ext-([a-z_]+)/);
                return m ? m[1].replace(/_/g, " ") : null;
              })
              .get()
              .filter(Boolean) as string[];
            const format = formatParts.length > 0 ? formatParts.join(", ") : null;

            screenings.push({
              title,
              year,
              date,
              time,
              venue: VENUE,
              bookingUrl,
              format,
            });
          });
      });
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
