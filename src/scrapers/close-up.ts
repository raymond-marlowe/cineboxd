import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const URL = "https://www.closeupfilmcentre.com/film_programmes/";
const CACHE_KEY = "close-up";
const VENUE = "Close-Up Film Centre";

function parseEntry(text: string): { date: string; time: string } | null {
  // Text like "Tue 17 Feb 8:15pm"
  const match = text.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(\w+)\s+(\d{1,2})[.:](\d{2})\s*(am|pm)/i
  );
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const hours = parseInt(match[3], 10);
  const minutes = match[4];
  const period = match[5].toLowerCase();

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthNum = monthMap[monthStr.toLowerCase().slice(0, 3)];
  if (monthNum === undefined) return null;

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthNum, day);
  // If the date is more than 2 months in the past, it's probably next year
  if (candidate.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
    year++;
  }

  const dateStr = `${year}-${String(monthNum + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  let h = hours;
  if (period === "pm" && h !== 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  const timeStr = `${String(h).padStart(2, "0")}:${minutes}`;

  return { date: dateStr, time: timeStr };
}

export async function scrapeCloseUp(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Calendar entries are in .inner_block_2_r_block divs
  // Each entry is a div with text like "Tue 17 Feb 8:15pm\nFilm Title"
  // and a link to the film detail page
  $(".inner_block_2_r_block div").each((_, el) => {
    const text = $(el).text().trim();
    const link = $(el).find("a").attr("href") || "";
    const title = $(el).find("a").text().trim();

    if (!title || !text.match(/\d{1,2}[.:]\d{2}\s*(?:pm|am)/i)) return;

    const parsed = parseEntry(text);
    if (!parsed) return;

    screenings.push({
      title,
      year: null,
      date: parsed.date,
      time: parsed.time,
      venue: VENUE,
      bookingUrl: link
        ? `https://www.closeupfilmcentre.com${link}`
        : null,
      format: null,
    });
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
