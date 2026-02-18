import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// Same Savoy Systems JSON-in-HTML pattern as Rio Cinema
const WHATS_ON_URL = "https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn";
const DLL_BASE = "https://thelexicinema.co.uk/TheLexiCinema.dll/";
const CACHE_KEY = "lexi";
const VENUE = "The Lexi Cinema";

interface LexiPerformance {
  StartDate: string;         // "2026-02-19"
  StartTimeAndNotes: string; // "15:30"
  IsSoldOut: "Y" | "N";
  IsOpenForSale: boolean;
  URL: string;               // relative booking path
  AD: "Y" | "N";            // Audio Described
  HOH: "Y" | "N";           // Hard of Hearing (Subtitles)
  SL: "Y" | "N";            // Signed Language
  QA: "Y" | "N";            // Q&A
  FF: "Y" | "N";            // Family Friendly
}

interface LexiEvent {
  Title: string;
  Year: string;
  Performances: LexiPerformance[];
  Tags: { Format: string }[];
}

interface LexiData {
  Events: LexiEvent[];
}

/** Build a format string from performance accessibility flags. */
function buildFormat(perf: LexiPerformance, tagFormat: string | null): string | null {
  const parts: string[] = [];
  if (tagFormat) parts.push(tagFormat);
  if (perf.AD === "Y") parts.push("Audio Described");
  if (perf.HOH === "Y") parts.push("Subtitled");
  if (perf.SL === "Y") parts.push("Signed");
  if (perf.QA === "Y") parts.push("Q&A");
  return parts.length > 0 ? parts.join(", ") : null;
}

export async function scrapeLexi(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(WHATS_ON_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  // The page embeds all event data as a JS variable:
  // var Events =
  // {"Events":[...]}
  const lines = html.split("\n");
  const varIdx = lines.findIndex((l) => l.trim().startsWith("var Events ="));
  if (varIdx === -1) return [];

  let data: LexiData;
  try {
    data = JSON.parse(lines[varIdx + 1]);
  } catch {
    return [];
  }

  const screenings: Screening[] = [];

  for (const event of data.Events) {
    if (!event.Title) continue;
    const title = event.Title.trim();
    const year = event.Year ? parseInt(event.Year, 10) : null;
    const tagFormat = event.Tags?.[0]?.Format || null;

    for (const perf of event.Performances ?? []) {
      if (!perf.StartDate || !perf.StartTimeAndNotes) continue;

      const bookingUrl = perf.URL
        ? DLL_BASE + perf.URL
        : null;

      screenings.push({
        title,
        year: year && !isNaN(year) ? year : null,
        date: perf.StartDate,
        time: perf.StartTimeAndNotes,
        venue: VENUE,
        bookingUrl: perf.IsSoldOut === "Y" ? null : bookingUrl,
        format: buildFormat(perf, tagFormat),
      });
    }
  }

  setCache(CACHE_KEY, screenings);
  return screenings;
}
