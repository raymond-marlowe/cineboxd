import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const URL = "https://www.ica.art/next-7-days";
const CACHE_KEY = "ica";
const VENUE = "ICA Cinema";

function parseDateHeader(text: string): string {
  // e.g. "Tue 17 Feb" or "Today" or "Tomorrow"
  const trimmed = text.trim();

  if (/today/i.test(trimmed)) {
    return new Date().toISOString().split("T")[0];
  }
  if (/tomorrow/i.test(trimmed)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const match = trimmed.match(/(\d{1,2})\s+(\w+)/);
  if (!match) return new Date().toISOString().split("T")[0];

  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthNum = monthMap[monthStr.toLowerCase().slice(0, 3)];
  if (monthNum === undefined) return new Date().toISOString().split("T")[0];

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthNum, day);
  if (candidate.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
    year++;
  }

  return `${year}-${String(monthNum + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTime(text: string): string {
  // e.g. "18:30" or "6:30pm"
  const match24 = text.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:${match24[2]}`;
    }
  }
  return text.trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/UK PREMIERE\s*/i, "")
    .replace(/WORLD PREMIERE\s*/i, "")
    .replace(/PREVIEW\s*/i, "")
    .trim();
}

export async function scrapeICA(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Walk through .item.films elements
  // Date headers are in .head.fold > .docket-date or standalone .docket-date
  $(".item.films").each((_, el) => {
    // Walk backwards to find the closest date header
    let prev = $(el).prev();
    let dateText = "";
    let tries = 0;
    while (prev.length && tries < 30) {
      const dd = prev.find(".docket-date");
      if (dd.length) {
        dateText = dd.text().trim();
        break;
      }
      if (prev.hasClass("docket-date")) {
        dateText = prev.text().trim();
        break;
      }
      prev = prev.prev();
      tries++;
    }

    const date = parseDateHeader(dateText);
    const rawTitle = $(el).find(".title").text().trim();
    const title = cleanTitle(rawTitle);
    if (!title) return;

    const link = $(el).find("a[href^='/films/']").attr("href") || "";
    const bookingUrl = link ? `https://www.ica.art${link}` : null;

    const times = $(el)
      .find(".time-slot")
      .map((_, t) => $(t).text().trim())
      .get();

    for (const timeText of times) {
      const time = parseTime(timeText);
      screenings.push({
        title,
        year: null,
        date,
        time,
        venue: VENUE,
        bookingUrl,
        format: null,
      });
    }
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
