import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const PAGE_URL = "https://www.actonecinema.co.uk/whats-on/";
const CACHE_KEY = "act-one";
const VENUE = "ActOne Cinema";

/**
 * Convert 12-hour time like "12:30PM" or " 3:00PM" to 24-hour "12:30" / "15:00".
 */
function parseTime12h(timeText: string): string {
  const match = timeText.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeText.trim();
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

export async function scrapeActOne(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // ActOne Cinema uses a Quasar (Vue) SPA. The initial HTML contains a hidden
  // pre-rendered div (z-index: -1000) with today's schedule for SEO/accessibility.
  // Structure inside: <a href="/movie/slug">TITLE</a> | <a href="/checkout/showing/slug/id">TIME</a>
  const today = new Date().toISOString().split("T")[0];

  // The hidden div is the first child of #q-app
  const hiddenDiv = $("#q-app > div").first();

  // Find paragraphs that contain film data (have at least one /movie/ link)
  // Use a Set to deduplicate by booking URL across duplicate mobile/desktop copies
  const seen = new Set<string>();

  hiddenDiv.find("p").each((_, p) => {
    const $p = $(p);
    if ($p.find('a[href*="/movie/"]').length === 0) return;

    let currentTitle: string | null = null;

    $p.contents().each((_, node) => {
      if (node.type !== "tag" || node.name !== "a") return;
      const $a = $(node);
      const href = $a.attr("href") || "";

      if (href.includes("/movie/")) {
        // New film title anchor
        currentTitle = $a
          .text()
          .trim()
          // Strip surrounding quotation marks that some titles have
          .replace(/^["'""]|["'""]$/g, "")
          .trim();
      } else if (href.includes("/checkout/showing/") && currentTitle) {
        if (seen.has(href)) return;
        seen.add(href);

        const timeText = $a.text().trim();
        const time = parseTime12h(timeText);
        if (!time) return;

        // Year is not present in ActOne title text
        const yearMatch = currentTitle.match(/\((\d{4})\)\s*$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const title = yearMatch
          ? currentTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
          : currentTitle;

        screenings.push({
          title,
          year,
          date: today,
          time,
          venue: VENUE,
          bookingUrl: href,
          format: null,
        });
      }
    });
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
