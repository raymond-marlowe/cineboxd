import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const CACHE_KEY = "everyman";
const SCHEDULE_URL =
  "https://www.everymancinema.com/api/gatsby-source-boxofficeapi/schedule";
const MOVIES_URL =
  "https://www.everymancinema.com/api/gatsby-source-boxofficeapi/movies";
const TIMEZONE = "Europe/London";
const DAYS_AHEAD = 14;
const BATCH_SIZE = 4; // venues per schedule request
const TIMEOUT_MS = 12_000;

/**
 * London Everyman venues.
 *
 * theaterId = internal Boxoffice/Webedia theater code, confirmed from
 *   https://www.everymancinema.com/{slug} venue pages.
 *   IDs appear in /venues-list/{id}-everyman-{slug}/ URL paths.
 *
 * To add a new venue:
 *   1. Open https://www.everymancinema.com/{slug}
 *   2. Find the ID in /venues-list/{id}-everyman-{slug}/ links
 *   3. Append { theaterId, name } here.
 *   4. Add coords to src/lib/venues.ts and a chip to src/components/SupportedVenues.tsx.
 */
export const VENUES = [
  { theaterId: "X0712", name: "Everyman Baker Street" },
  { theaterId: "X06SI", name: "Everyman Barnet" },
  { theaterId: "X077P", name: "Everyman Belsize Park" },
  { theaterId: "G011I", name: "Everyman Borough Yards" },
  { theaterId: "G049A", name: "Everyman Brentford" },
  { theaterId: "X11NT", name: "Everyman Broadgate" },
  { theaterId: "X0VPB", name: "Everyman Canary Wharf" },
  { theaterId: "X078X", name: "Everyman Chelsea" },
  { theaterId: "X11DR", name: "Everyman Crystal Palace" },
  { theaterId: "X06ZW", name: "Everyman Hampstead" },
  { theaterId: "X0X5P", name: "Everyman King's Cross" },
  { theaterId: "X0LWI", name: "Everyman Maida Vale" },
  { theaterId: "X06SN", name: "Everyman Muswell Hill" },
  { theaterId: "X077O", name: "Everyman Screen on the Green" },
  { theaterId: "G029X", name: "Everyman Stratford International" },
  { theaterId: "G05D7", name: "Everyman The Whiteley" },
] as const;

// ------- API response types (minimal — only fields we use) ---------------

interface EwTicketing {
  urls: string[];
  provider: string; // "default" | "relay"
  type: string;     // "DESKTOP"
}

export interface EwShowtime {
  startsAt: string;    // "2026-02-25T13:30:00" — local London time, no tz suffix
  isExpired: boolean;
  tags: string[];
  data: { ticketing: EwTicketing[] };
}

// Response: { [theaterId]: { schedule: { [movieId]: { [date]: EwShowtime[] } } } }
export type EwScheduleResponse = Record<
  string,
  { schedule: Record<string, Record<string, EwShowtime[]>> }
>;

export type EwMovieList = { id: string; title: string }[];

// ------- Format extraction ------------------------------------------------

/**
 * Maps Boxoffice tags → human-readable format/event label.
 * First matching tag in priority order wins; null = standard screening.
 * Exported for unit tests.
 */
const FORMAT_PRIORITY: [tag: string, label: string][] = [
  ["Format.Projection.35mm",            "35mm"],
  ["Showtime.Event.QandAEvent",         "Q&A"],
  ["Showtime.Event.Preview",            "Preview"],
  ["Auditorium.Experience.DolbyAtmos",  "Dolby Atmos"],
  ["Showtime.Restriction.SilverScreen", "Silver Screen"],
  ["Showtime.Restriction.BabyClub",     "Baby Club"],
  ["Showtime.Accessibility.Subtitled",  "Subtitled"],
];

export function extractFormat(tags: string[]): string | null {
  for (const [tag, label] of FORMAT_PRIORITY) {
    if (tags.includes(tag)) return label;
  }
  return null;
}

// ------- Date range -------------------------------------------------------

function buildDateRange(): { from: string; to: string } {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + DAYS_AHEAD);
  to.setUTCHours(23, 59, 59, 0);
  // Format without timezone offset: "2026-02-25T00:00:00"
  const fmt = (d: Date) => d.toISOString().slice(0, 19);
  return { from: fmt(from), to: fmt(to) };
}

// ------- Pure transform — exported for unit tests (no network) -----------

/**
 * Flattens an Everyman schedule API response into Screening[].
 *
 * venueMap  — maps theaterId → canonical venue name.
 * movieMap  — maps movieId  → film title.
 * seen      — booking-URL dedup set; share across multiple calls.
 *             Falls back to "venue|date|time|title" if no booking URL.
 *
 * Expired shows and entries with unknown theaters/movies are silently skipped.
 */
export function transformSchedule(
  response: EwScheduleResponse,
  venueMap: Map<string, string>,
  movieMap: Map<string, string>,
  seen = new Set<string>()
): Screening[] {
  const screenings: Screening[] = [];

  for (const [theaterId, theaterData] of Object.entries(response)) {
    const venueName = venueMap.get(theaterId);
    if (!venueName || !theaterData?.schedule) continue;

    for (const [movieId, dates] of Object.entries(theaterData.schedule)) {
      const title = movieMap.get(movieId);
      if (!title) continue;

      for (const [date, showtimes] of Object.entries(dates)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        for (const st of showtimes) {
          if (st.isExpired) continue;
          if (!st.startsAt) continue;

          // startsAt: "2026-02-25T13:30:00" → time = "13:30"
          const time = st.startsAt.slice(11, 16);
          if (!/^\d{2}:\d{2}$/.test(time)) continue;

          // Booking URL: first "default" provider entry
          const defaultTicket = st.data?.ticketing?.find(
            (t) => t.provider === "default"
          );
          const bookingUrl = defaultTicket?.urls?.[0] ?? null;

          const dedupKey =
            bookingUrl ?? `${venueName}|${date}|${time}|${title}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          screenings.push({
            title,
            year: null,
            date,
            time,
            venue: venueName,
            bookingUrl,
            format: extractFormat(st.tags ?? []),
          });
        }
      }
    }
  }

  return screenings;
}

// ------- Network fetch ----------------------------------------------------

async function fetchScheduleBatch(
  theaterIds: string[],
  from: string,
  to: string
): Promise<EwScheduleResponse> {
  const params = new URLSearchParams();
  for (const id of theaterIds) {
    params.append("theaters", JSON.stringify({ id, timeZone: TIMEZONE }));
  }
  params.append("from", from);
  params.append("to", to);

  const res = await fetch(`${SCHEDULE_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `schedule HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  return res.json() as Promise<EwScheduleResponse>;
}

async function fetchMovies(movieIds: string[]): Promise<EwMovieList> {
  if (movieIds.length === 0) return [];
  const params = new URLSearchParams();
  for (const id of movieIds) params.append("ids", id);

  const res = await fetch(`${MOVIES_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `movies HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  return res.json() as Promise<EwMovieList>;
}

// ------- Main exported scraper -------------------------------------------

export async function scrapeEveryman(): Promise<Screening[]> {
  // Feature flag: set ENABLE_EVERYMAN=true in env to activate.
  if (process.env.ENABLE_EVERYMAN !== "true") return [];

  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const start = Date.now();
  const { from, to } = buildDateRange();

  const venueMap = new Map(VENUES.map((v) => [v.theaterId, v.name]));
  const theaterIds = VENUES.map((v) => v.theaterId);

  // Split venues into batches of BATCH_SIZE and fetch schedules concurrently
  const batches: string[][] = [];
  for (let i = 0; i < theaterIds.length; i += BATCH_SIZE) {
    batches.push(theaterIds.slice(i, i + BATCH_SIZE));
  }

  const scheduleResults = await Promise.allSettled(
    batches.map((ids) => fetchScheduleBatch(ids, from, to))
  );

  // Collect successful responses + all unique movie IDs
  const scheduleResponses: EwScheduleResponse[] = [];
  const allMovieIds = new Set<string>();

  for (let i = 0; i < scheduleResults.length; i++) {
    const r = scheduleResults[i];
    if (r.status === "fulfilled") {
      scheduleResponses.push(r.value);
      for (const theaterData of Object.values(r.value)) {
        for (const movieId of Object.keys(theaterData.schedule ?? {})) {
          allMovieIds.add(movieId);
        }
      }
    } else {
      console.error(
        `[everyman] schedule batch [${batches[i].join(", ")}] failed:`,
        r.reason instanceof Error ? r.reason.message : r.reason
      );
    }
  }

  // Fetch movie titles for all discovered IDs in one call
  const movieMap = new Map<string, string>();
  if (allMovieIds.size > 0) {
    try {
      const movies = await fetchMovies([...allMovieIds]);
      for (const m of movies) {
        if (m.id && m.title) movieMap.set(m.id, m.title);
      }
    } catch (err) {
      console.error(
        "[everyman] movies fetch failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Flatten all schedule responses into Screenings
  const seen = new Set<string>();
  const allScreenings: Screening[] = [];
  for (const response of scheduleResponses) {
    allScreenings.push(...transformSchedule(response, venueMap, movieMap, seen));
  }

  console.log(
    `[everyman] total: ${allScreenings.length} screenings from ${VENUES.length} venues in ${Date.now() - start}ms`
  );

  if (allScreenings.length > 0) setCache(CACHE_KEY, allScreenings);
  return allScreenings;
}
