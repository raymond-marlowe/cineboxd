import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const URL = "https://www.barbican.org.uk/whats-on/cinema";
const CACHE_KEY = "barbican";
const VENUE = "Barbican Cinema";

function parseShowtimeDate(text: string): string {
  // e.g. "Showtimes for Tue 17 Feb" or "Tue 17 Feb 2026"
  const match = text.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (!match) return new Date().toISOString().split("T")[0];

  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const yearStr = match[3];

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthNum = monthMap[monthStr.toLowerCase().slice(0, 3)];
  if (monthNum === undefined) return new Date().toISOString().split("T")[0];

  const now = new Date();
  let year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
  if (!yearStr) {
    const candidate = new Date(year, monthNum, day);
    if (candidate.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
      year++;
    }
  }

  return `${year}-${String(monthNum + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTime(text: string): string {
  const match = text.match(/(\d{1,2})[.:](\d{2})/);
  if (!match) return text.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export async function scrapeBarbican(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  $(".cinema-listing-card").each((_, card) => {
    const rawTitle = $(card).find(".cinema-listing-card__title").text().trim();
    if (!rawTitle) return;

    // Strip surrounding quotes (Barbican sometimes wraps titles in &quot;...&quot;)
    const title = rawTitle.replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "").trim();
    if (!title) return;

    // Year from title if present
    const yearMatch = title.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const cleanTitle = yearMatch ? title.replace(/\s*\(\d{4}\)\s*$/, "") : title;

    // Each card can have multiple date sections
    $(card).find(".cinema-instance-list").each((_, instanceList) => {
      const dateText = $(instanceList)
        .find(".cinema-instance-list__title")
        .text()
        .trim();
      const date = parseShowtimeDate(dateText);

      $(instanceList)
        .find(".cinema-instance-list__instance")
        .each((_, instance) => {
          // The time is inside a button-styled-link <a>, grab its text
          const linkEl = $(instance).find("a").first();
          const timeText = linkEl.text().trim();
          const time = parseTime(timeText);
          const bookingUrl = linkEl.attr("href") || null;

          screenings.push({
            title: cleanTitle,
            year,
            date,
            time,
            venue: VENUE,
            bookingUrl,
            format: null,
          });
        });
    });
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
