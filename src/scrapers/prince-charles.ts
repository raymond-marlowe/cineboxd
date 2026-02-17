import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const URL = "https://www.princecharlescinema.com/next-7-days/";
const CACHE_KEY = "prince-charles";
const VENUE = "Prince Charles Cinema";

function parseDate(dateText: string): string {
  const trimmed = dateText.trim();
  if (/today/i.test(trimmed)) {
    return new Date().toISOString().split("T")[0];
  }
  // e.g. "Wednesday 18 Feb 2026"
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}

function parseTime(timeText: string): string {
  // e.g. "2:45 pm" → "14:45"
  const match = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return timeText.trim();
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toLowerCase();
  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

export async function scrapePrinceCharles(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  $(".day").each((_, dayEl) => {
    const dateText = $(dayEl).find("h4").first().text();
    const date = parseDate(dateText);

    $(dayEl)
      .find(".performance-dayslist")
      .each((_, listingEl) => {
        const titleLink = $(listingEl).find(".leftsideperf a").first();
        const title = titleLink.text().trim();
        if (!title) return;

        const timeText = $(listingEl).find(".time").first().text();
        const time = parseTime(timeText);

        const tags = $(listingEl)
          .find(".movietag .tag")
          .map((_, t) => $(t).text().trim())
          .get();
        const format = tags.length > 0 ? tags.join(", ") : null;

        const bookLink = $(listingEl).find("a.film_book_button");
        const bookingUrl = bookLink.length
          ? bookLink.attr("href") || null
          : null;

        // Try to extract year from title like "Robin Hood (1973)"
        const yearMatch = title.match(/\((\d{4})\)\s*$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const cleanTitle = yearMatch
          ? title.replace(/\s*\(\d{4}\)\s*$/, "")
          : title;

        screenings.push({
          title: cleanTitle,
          year,
          date,
          time,
          venue: VENUE,
          bookingUrl,
          format,
        });
      });
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
