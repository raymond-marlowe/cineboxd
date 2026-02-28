import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";
import { isEnabled } from "@/lib/feature-flags";

const CACHE_KEY = "picturehouse";
const API_URL = "https://www.picturehouses.com/api/scheduled-movies-ajax";
const BOOKING_BASE = "https://web.picturehouses.com/order/showtimes";

/**
 * London Picturehouse venues.
 *
 * cinemaId = numeric code used by the Picturehouse API (the CINEMA_ID JS
 *            variable on each cinema page, e.g. CINEMA_ID = '022').
 *
 * To add a new venue:
 *   1. Open its page: https://www.picturehouses.com/cinema/<slug>
 *   2. View source and search for  CINEMA_ID = '
 *   3. Append { cinemaId: "NNN", name: "..." } here.
 *   4. Add coords to src/lib/venues.ts and a chip to src/components/SupportedVenues.tsx.
 */
export const VENUES = [
  { cinemaId: "020", name: "Clapham Picturehouse" },
  { cinemaId: "024", name: "Crouch End Picturehouse" },
  { cinemaId: "031", name: "Ealing Picturehouse" },
  { cinemaId: "009", name: "East Dulwich Picturehouse" },
  { cinemaId: "029", name: "Finsbury Park Picturehouse" },
  { cinemaId: "021", name: "Greenwich Picturehouse" },
  { cinemaId: "010", name: "Hackney Picturehouse" },
  { cinemaId: "022", name: "Picturehouse Central" },
  { cinemaId: "004", name: "Ritzy Picturehouse" },
  { cinemaId: "016", name: "The Gate Picturehouse" },
  { cinemaId: "023", name: "West Norwood Picturehouse" },
] as const;

// ------- API response types (minimal — only fields we use) ---------------

interface PhShowtime {
  CinemaId: string;
  SessionId: string;
  time: string;   // "20:30" — already 24-hour
  date_f: string; // "2026-02-27"
}

interface PhMovie {
  Title: string;
  show_times?: PhShowtime[];
}

export interface PhResponse {
  response: string; // "success" | anything else = error
  movies?: PhMovie[];
}

// ------- Helpers --------------------------------------------------------

/**
 * Builds a deterministic booking URL from the IDs in the API response.
 * Pattern confirmed from Picturehouse website JS:
 *   https://web.picturehouses.com/order/showtimes/{CinemaId}-{SessionId}/seats
 * Exported for unit tests.
 */
export function buildBookingUrl(cinemaId: string, sessionId: string): string {
  return `${BOOKING_BASE}/${cinemaId}-${sessionId}/seats`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24_RE = /^\d{2}:\d{2}$/;

function validDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  return !isNaN(new Date(s).getTime());
}

function validTime(s: string): boolean {
  if (!TIME_24_RE.test(s)) return false;
  const [h, m] = s.split(":").map(Number);
  return h <= 23 && m <= 59;
}

// ------- Pure transform — exported for unit tests (no network) ----------

/**
 * Transforms a raw Picturehouse API response into Screening[].
 *
 * `venueName` — canonical venue name string (must match VENUE_COORDS key).
 * `seen`      — booking-URL dedup set; pass a shared set across multiple
 *               calls to avoid cross-cinema duplicates. Defaults to fresh.
 *
 * Screenings that fail validation are silently skipped so one bad entry
 * never throws or drops the rest of the cinema's listings.
 */
export function transformPhResponse(
  data: PhResponse,
  venueName: string,
  seen = new Set<string>()
): Screening[] {
  if (data.response !== "success" || !Array.isArray(data.movies)) return [];

  const screenings: Screening[] = [];

  for (const movie of data.movies) {
    const title = movie.Title?.trim();
    if (!title) continue;

    for (const st of movie.show_times ?? []) {
      const { CinemaId, SessionId, date_f, time } = st;

      if (!validDate(date_f)) continue;
      if (!validTime(time)) continue;
      if (!SessionId) continue;

      const url = buildBookingUrl(CinemaId, SessionId);
      if (seen.has(url)) continue;
      seen.add(url);

      screenings.push({
        title,
        year: null,
        date: date_f,
        time,
        venue: venueName,
        bookingUrl: url,
        format: null,
      });
    }
  }

  return screenings;
}

// ------- Network fetch --------------------------------------------------

async function fetchCinema(cinemaId: string, venueName: string): Promise<Screening[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0",
    },
    body: `cinema_id=${cinemaId}`,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const data = await res.json() as PhResponse;
  return transformPhResponse(data, venueName);
}

// ------- Main exported scraper ------------------------------------------

export async function scrapePicturehouse(): Promise<Screening[]> {
  // Feature flag: set ENABLE_PICTUREHOUSE=true (or 1/yes/on) in env to activate.
  if (!isEnabled("ENABLE_PICTUREHOUSE")) return [];

  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const start = Date.now();
  const results = await Promise.allSettled(
    VENUES.map((v) => fetchCinema(v.cinemaId, v.name))
  );

  // Collect results; deduplicate across venues by booking URL.
  const seen = new Set<string>();
  const allScreenings: Screening[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const { name } = VENUES[i];
    if (r.status === "fulfilled") {
      allScreenings.push(...r.value);
    } else {
      console.error(
        `[picturehouse] ${name} failed:`,
        r.reason instanceof Error ? r.reason.message : r.reason
      );
    }
  }

  const screenings = allScreenings.filter((s) => {
    if (!s.bookingUrl || seen.has(s.bookingUrl)) return false;
    seen.add(s.bookingUrl);
    return true;
  });

  console.log(
    `[picturehouse] total: ${screenings.length} screenings from ${VENUES.length} venues in ${Date.now() - start}ms`
  );

  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
