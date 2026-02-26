import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// The Nickel is a Next.js SSR app.  All listing cards are server-rendered on
// the homepage, so a single fetch is sufficient — no need to follow individual
// /screening/NNN detail pages (their body is client-rendered and unreachable
// server-side).
const HOME_URL = "https://thenickel.co.uk/";
const CACHE_KEY = "nickel";
const VENUE = "The Nickel";
// Keep runtime short: cap how many cards we process.
const MAX_CARDS = 40;

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse "Thursday 26.2" (or "26.2") → "2026-02-26".
 * Date format is DD.M where M is the numeric month (1-indexed, not zero-padded).
 * Year is inferred: if the candidate date is more than 60 days in the past,
 * assume next year.
 */
function parseNickelDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10); // 1-indexed
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
    year++;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse an am/pm time string like "6pm", "6:30pm", "3.45pm" → "HH:mm".
 */
function parseAmPmTime(s: string): string | null {
  const m = s.trim().match(/(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  const period = m[3].toLowerCase();
  if (period === "pm" && h !== 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

export async function scrapeNickel(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(HOME_URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Each card is a full <a> wrapping a grid section.
  // React comment nodes (<!-- -->) are stripped by Cheerio, leaving plain text.
  const cards = $('a[href^="/screening/"]').slice(0, MAX_CARDS);

  cards.each((_, card) => {
    const href = $(card).attr("href") ?? "";
    const idMatch = href.match(/\/screening\/(\d+)/);
    if (!idMatch) return;
    const bookingUrl = `https://thenickel.co.uk/screening/${idMatch[1]}`;

    // ── Title ──────────────────────────────────────────────────────────────────
    // <p class="font-bold uppercase text-gray-700 ...">TITLE</p>
    const titleEl = $(card)
      .find("p")
      .filter((_, el) => {
        const cls = $(el).attr("class") ?? "";
        return cls.includes("uppercase") && cls.includes("font-bold");
      })
      .first();
    const rawTitle = titleEl.text().trim();
    if (!rawTitle) return;
    const title = toTitleCase(rawTitle);

    // ── Date / time / sold-out ─────────────────────────────────────────────────
    // The info column contains leaf <div> elements:
    //   <div>Thursday 26.2</div>
    //   <div>Doors 6pm</div>
    //   <div>Film 6:30pm</div>
    //   <div>Digital</div>
    //   <div class="mt-2 underline ...">Book here</div>   ← or "Sold Out"
    let dateStr: string | null = null;
    let filmTime: string | null = null;
    let doorsTime: string | null = null;
    let isSoldOut = false;
    let format: string | null = null;

    $(card)
      .find("div")
      .each((_, div) => {
        // Skip container divs that have element children.
        if ($(div).children("div, span, p, a, img, picture").length > 0) return;

        const text = $(div).text().replace(/\s+/g, " ").trim();
        if (!text) return;

        // Date: must contain a day-name abbreviation AND the DD.M pattern.
        if (
          dateStr === null &&
          /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(text) &&
          /\d{1,2}\.\d{1,2}/.test(text)
        ) {
          dateStr = parseNickelDate(text);
          return;
        }

        const lower = text.toLowerCase();

        if (lower.startsWith("film ")) {
          filmTime = parseAmPmTime(text.slice(5));
          return;
        }
        if (lower.startsWith("doors ")) {
          doorsTime = parseAmPmTime(text.slice(6));
          return;
        }
        if (lower === "sold out") {
          isSoldOut = true;
          return;
        }
        // Format tag: "35mm", "16mm", "Digital", "4K", "Blu-ray", etc.
        if (/^(35mm|16mm|digital|4k|blu-?ray|vhs|dvd)/i.test(text)) {
          format = text;
        }
      });

    // Prefer "Film" start time; fall back to "Doors" time.
    const time = filmTime ?? doorsTime;
    if (!dateStr || !time) return;

    screenings.push({
      title,
      year: null,
      date: dateStr,
      time,
      venue: VENUE,
      bookingUrl: isSoldOut ? null : bookingUrl,
      format,
    });
  });

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
