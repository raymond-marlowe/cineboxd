import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const BASE_URL = "https://ticketing.eu.veezi.com";
const CACHE_KEY = "curzon-veezi";

const VENUES = [
  { siteToken: "a4xawmcnn5xz11am1ayy6ykfdm", name: "Curzon Sea Containers" },
  { siteToken: "pvmm3g2bze4sajxy7qyab2x344", name: "Curzon Goldsmiths" },
] as const;

// Full month names used by Veezi: "Friday 27, February"
const MONTHS: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

// "Friday 27, February" → "YYYY-MM-DD"  (exported for tests)
export function parseVeeziDate(text: string): string | null {
  const match = text.trim().match(/\w+\s+(\d{1,2}),\s+(\w+)/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2]];
  if (month === undefined) return null;
  const today = new Date();
  let year = today.getFullYear();
  if (month < today.getMonth() || (month === today.getMonth() && day < today.getDate() - 3)) {
    year++;
  }
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// "6:15 PM" → "18:15"  (exported for tests)
export function parseVeeziTime(text: string): string | null {
  const match = text.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const p = match[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

// Prefixes to strip (conservative: only Q&A and Preview variants)
const EVENT_PREFIX_RE = /^(Q&A|Preview|Previews):\s*/i;

// Pure HTML parser — exported so tests can call it without a network hit
export function parseVeeziPage(html: string, venueName: string): Screening[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const screenings: Screening[] = [];

  // Prefer "sort by film" tab; fall back to whole document
  const scope = $("#sessionsByFilmConent").length
    ? $("#sessionsByFilmConent")
    : $.root();

  scope.find("h3.title").each((_, titleEl) => {
    const rawTitle = $(titleEl).text().trim();
    if (!rawTitle) return;

    const prefixMatch = rawTitle.match(EVENT_PREFIX_RE);
    const title = prefixMatch ? rawTitle.slice(prefixMatch[0].length).trim() : rawTitle;
    const format = prefixMatch ? prefixMatch[1].trim() : null;

    const yearMatch = title.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const cleanTitle = yearMatch ? title.replace(/\s*\(\d{4}\)\s*$/, "").trim() : title;

    const parent = $(titleEl).parent();

    parent.find("div.date-container").each((_, dateEl) => {
      const dateText = $(dateEl).find("h4.date").first().text();
      const date = parseVeeziDate(dateText);
      if (!date) return;

      $(dateEl).find("ul.session-times li").each((_, liEl) => {
        const a = $(liEl).find("a[href]").first();
        const href = a.attr("href");
        if (!href) return; // no link = sold out → skip

        const timeText = a.find("time").text().trim() || a.text().trim();
        const time = parseVeeziTime(timeText);
        if (!time) return;

        const bookingUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        if (seen.has(bookingUrl)) return;
        seen.add(bookingUrl);

        screenings.push({ title: cleanTitle, year, date, time,
                          venue: venueName, bookingUrl, format });
      });
    });
  });

  return screenings;
}

async function scrapeVeeziSessions(siteToken: string, venueName: string): Promise<Screening[]> {
  const url = `${BASE_URL}/sessions/?siteToken=${siteToken}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await res.text();
    const screenings = parseVeeziPage(html, venueName);
    console.log(`[curzon-veezi] ${venueName}: ${screenings.length} screenings in ${Date.now() - start}ms`);
    return screenings;
  } catch (err) {
    console.error(`[curzon-veezi] ${venueName} error after ${Date.now() - start}ms:`, err);
    return [];
  }
}

export async function scrapeCurzonVeezi(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const results = await Promise.allSettled(
    VENUES.map((v) => scrapeVeeziSessions(v.siteToken, v.name))
  );
  const screenings = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);

  setCache(CACHE_KEY, screenings);
  return screenings;
}
