/**
 * Electric Cinema scraper
 *
 * Both venues (Portobello + White City) are served by a single public JSON
 * endpoint that Electric Cinema's custom Lit/Vista frontend polls every 2 min:
 *
 *   GET https://electriccinema.co.uk/data/data.json
 *   (no auth, no API key, no special headers required)
 *
 * Structure:
 *   data.cinemas  — keyed by cinema ID (603 = Portobello, 602 = White City)
 *   data.films    — keyed by film ID, contains title
 *   data.screenings — keyed by screening ID, contains date/time/cinema/booking
 *
 * Screening fields that matter:
 *   d         YYYY-MM-DD  (already in London local date — no TZ conversion needed)
 *   t         HH:MM       (already in London local time)
 *   film      film ID
 *   cinema    cinema ID
 *   bookable  boolean
 *   link      "/tickets/{id}" — null/false when not bookable online
 */

import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const DATA_URL = "https://electriccinema.co.uk/data/data.json";
const CACHE_KEY = "electric";
const BOOKING_BASE = "https://www.electriccinema.co.uk";
const FETCH_TIMEOUT_MS = 18_000;

const CINEMA_NAMES: Record<number, string> = {
  603: "Electric Cinema Portobello",
  602: "Electric Cinema White City",
};

interface ElectricScreening {
  id: number;
  film: number;
  d: string;        // YYYY-MM-DD
  t: string;        // HH:MM
  cinema: number;
  bookable: boolean;
  link: string | false | null;
}

interface ElectricFilm {
  title: string;
}

interface ElectricData {
  cinemas: Record<string, unknown>;
  films: Record<string, ElectricFilm>;
  screenings: Record<string, ElectricScreening>;
}

export async function scrapeElectric(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(DATA_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "application/json, */*",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`[electric] HTTP ${res.status} ${res.statusText}`);
  }

  const data: ElectricData = await res.json();

  const screenings: Screening[] = [];

  for (const raw of Object.values(data.screenings)) {
    const venueName = CINEMA_NAMES[raw.cinema];
    if (!venueName) continue; // unknown cinema — skip

    const film = data.films[String(raw.film)];
    if (!film?.title) continue;

    const bookingUrl =
      raw.bookable && raw.link
        ? `${BOOKING_BASE}${raw.link}`
        : null;

    screenings.push({
      title: film.title,
      year: null,
      date: raw.d,
      time: raw.t,
      venue: venueName,
      bookingUrl,
      format: null,
    });
  }

  if (screenings.length > 0) {
    setCache(CACHE_KEY, screenings);
  } else {
    console.warn("[electric] parsed 0 screenings — data structure may have changed");
  }

  return screenings;
}
