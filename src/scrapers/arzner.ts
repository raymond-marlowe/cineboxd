import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// The Arzner uses the Savoy Systems platform.
// All event data is embedded in the page as `var Events = { "Events": [...] }`
// — the same shape as Rio Cinema.  No auth required.
const WHATS_ON_URL = "https://thearzner.com/TheArzner.dll/WhatsOn";
const BASE_URL = "https://thearzner.com/TheArzner.dll/";
const CACHE_KEY = "arzner";
const VENUE = "The Arzner";

interface ArznerPerformance {
  StartDate: string;         // "2026-02-26"
  StartTimeAndNotes: string; // "12:00"
  IsSoldOut: "Y" | "N";
  IsOpenForSale: boolean;
  URL: string;               // relative booking path
}

interface ArznerEvent {
  Title: string;
  Year: string;
  Performances: ArznerPerformance[];
  Tags: { Format: string }[];
}

interface ArznerData {
  Events: ArznerEvent[];
}

export async function scrapeArzner(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(WHATS_ON_URL);
  const html = await res.text();

  // Data is on the line immediately after `var Events =`
  const lines = html.split("\n");
  const varLineIndex = lines.findIndex((l) =>
    l.trim().startsWith("var Events =")
  );
  if (varLineIndex === -1) return [];

  let data: ArznerData;
  try {
    data = JSON.parse(lines[varLineIndex + 1]);
  } catch {
    return [];
  }

  const screenings: Screening[] = [];

  for (const event of data.Events) {
    const year = event.Year ? parseInt(event.Year, 10) : null;
    const format = event.Tags?.[0]?.Format || null;

    for (const perf of event.Performances) {
      const bookingUrl = perf.URL ? `${BASE_URL}${perf.URL}` : null;

      screenings.push({
        title: event.Title,
        year: year && !isNaN(year) ? year : null,
        date: perf.StartDate,
        time: perf.StartTimeAndNotes,
        venue: VENUE,
        bookingUrl: perf.IsSoldOut === "Y" ? null : bookingUrl,
        format: format || null,
      });
    }
  }

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
