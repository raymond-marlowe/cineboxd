import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const EVENTS_URL = "https://system.spektrix.com/jw3/api/v3/events";
const CACHE_KEY = "jw3";
const VENUE = "JW3";

// JW3 cinema uses the Spektrix ticketing API (public, no auth required).
// The main JW3 website is a Drupal CMS; individual showtime slots are only
// available via the Spektrix API — the Drupal film pages only show date ranges.
//
//   Step 1: GET https://system.spektrix.com/jw3/api/v3/events
//           Filter: attribute_Genre === "Cinema"
//           Fields: id, name, attribute_SeriesOrFestival, attribute_Language
//
//   Step 2: GET .../events/{id}/instances  (one request per cinema event)
//           Fields: start (local ISO, London time), cancelled, attribute_SLCaptioned
//
//   Booking URL: https://www.jw3.org.uk/whats-on/{slugified-event-name}  (best-effort)

interface SpektrixEvent {
  id: string;
  name: string;
  attribute_Genre: string;
  attribute_SeriesOrFestival: string;
  attribute_Language: string;
}

interface SpektrixInstance {
  start: string;       // local London ISO datetime e.g. "2026-02-16T16:10:00"
  cancelled: boolean;
  attribute_SLCaptioned: boolean;
}

// Slugify event name to construct a best-effort JW3 detail URL.
// e.g. "National Theatre Live: Hamlet" → "national-theatre-live-hamlet"
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function scrapeJW3(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const headers = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

  // Step 1: all events → filter to Cinema genre
  const events: SpektrixEvent[] = await fetch(EVENTS_URL, { headers }).then(
    (r) => r.json()
  );
  const cinemaEvents = events.filter((e) => e.attribute_Genre === "Cinema");

  // Today's date string for filtering past screenings
  const todayStr = new Date().toISOString().split("T")[0];

  // Step 2: fetch instances for each cinema event in parallel
  const results = await Promise.allSettled(
    cinemaEvents.map(async (event) => {
      const instances: SpektrixInstance[] = await fetch(
        `${EVENTS_URL}/${event.id}/instances`,
        { headers }
      ).then((r) => r.json());

      // Strip known series prefix from title so it matches Letterboxd entries.
      // e.g. "Babykino: Eternity" (series="Babykino") → title "Eternity"
      const series = event.attribute_SeriesOrFestival?.trim() ?? "";
      let rawTitle = event.name.trim();
      if (
        series &&
        rawTitle.toLowerCase().startsWith(series.toLowerCase() + ":")
      ) {
        rawTitle = rawTitle.substring(series.length + 1).trim();
      }
      const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const title = yearMatch
        ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
        : rawTitle;

      // Booking URL uses the full (un-stripped) event name for the slug
      const bookingUrl = `https://www.jw3.org.uk/whats-on/${slugify(event.name)}`;

      const screenings: Screening[] = [];
      for (const inst of instances) {
        if (inst.cancelled) continue;
        const dateStr = inst.start.split("T")[0];
        if (dateStr < todayStr) continue; // skip past dates
        const time = inst.start.substring(11, 16); // "HH:MM"

        const formatParts: string[] = [];
        if (series) formatParts.push(series);
        if (inst.attribute_SLCaptioned) formatParts.push("Captioned");
        if (event.attribute_Language && event.attribute_Language !== "English") {
          formatParts.push(event.attribute_Language);
        }
        const format = formatParts.length > 0 ? formatParts.join(", ") : null;

        screenings.push({
          title,
          year,
          date: dateStr,
          time,
          venue: VENUE,
          bookingUrl,
          format,
        });
      }
      return screenings;
    })
  );

  const screenings = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
  setCache(CACHE_KEY, screenings);
  return screenings;
}
