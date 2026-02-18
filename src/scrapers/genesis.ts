import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const URL = "https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn";
const CACHE_KEY = "genesis";
const VENUE = "Genesis Cinema";
const BASE_URL = "https://genesiscinema.co.uk/GenesisCinema.dll/";

/** "panel_20260218" → "2026-02-18" */
function parsePanelDate(id: string): string {
  const match = id.match(/panel_(\d{4})(\d{2})(\d{2})/);
  if (!match) return new Date().toISOString().split("T")[0];
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export async function scrapeGenesis(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings: Screening[] = [];

  // Each date has a panel div: <div id="panel_YYYYMMDD" class="... whatson_panel ...">
  $("div.whatson_panel").each((_, panelEl) => {
    const panelId = $(panelEl).attr("id") || "";
    const date = parsePanelDate(panelId);

    // Each film is in a div.grid-container-border
    $(panelEl)
      .find("div.grid-container-border")
      .each((_, filmEl) => {
        const titleAnchor = $(filmEl).find("h2.text-black > a").first();
        const rawTitle = titleAnchor.text().trim();
        if (!rawTitle) return;

        const relHref = titleAnchor.attr("href") || "";
        // Film detail page (not used as bookingUrl, each perf has its own URL)

        const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const title = yearMatch
          ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
          : rawTitle;

        // Deduplicate perfs by booking URL (the same perf appears in desktop + mobile divs)
        const seen = new Set<string>();

        $(filmEl)
          .find(".perfButton")
          .each((_, btn) => {
            const bookingUrl = $(btn).attr("href") || null;
            if (!bookingUrl) return;
            if (seen.has(bookingUrl)) return;
            seen.add(bookingUrl);

            const timeText = $(btn).text().trim();
            if (!timeText) return;

            screenings.push({
              title,
              year,
              date,
              time: timeText,
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
