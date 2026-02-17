import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const WHATS_ON_URL = "https://riocinema.org.uk/Rio.dll/WhatsOn";
const CACHE_KEY = "rio";
const VENUE = "Rio Cinema";

interface RioPerformance {
  StartDate: string; // ISO: "2026-02-17"
  StartTimeAndNotes: string; // "14:40"
  IsSoldOut: "Y" | "N";
  IsOpenForSale: boolean;
  URL: string; // relative booking URL
}

interface RioEvent {
  Title: string; // UPPERCASE
  Year: string;
  Performances: RioPerformance[];
  Tags: { Format: string }[];
}

interface RioData {
  Events: RioEvent[];
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrapeRio(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(WHATS_ON_URL);
  const html = await res.text();

  // The page embeds all event data as a JS variable:
  // var Events =
  // {"Events":[...]}
  const lines = html.split("\n");
  const varLineIndex = lines.findIndex((l) =>
    l.trim().startsWith("var Events =")
  );
  if (varLineIndex === -1) return [];

  const jsonLine = lines[varLineIndex + 1];
  let data: RioData;
  try {
    data = JSON.parse(jsonLine);
  } catch {
    return [];
  }

  const screenings: Screening[] = [];

  for (const event of data.Events) {
    const title = toTitleCase(event.Title);
    const year = event.Year ? parseInt(event.Year, 10) : null;
    const format = event.Tags?.[0]?.Format || null;

    for (const perf of event.Performances) {
      const bookingUrl = perf.URL
        ? `https://riocinema.org.uk/Rio.dll/${perf.URL}`
        : null;

      screenings.push({
        title,
        year: year && !isNaN(year) ? year : null,
        date: perf.StartDate,
        time: perf.StartTimeAndNotes,
        venue: VENUE,
        bookingUrl: perf.IsSoldOut === "Y" ? null : bookingUrl,
        format,
      });
    }
  }

  setCache(CACHE_KEY, screenings);
  return screenings;
}
