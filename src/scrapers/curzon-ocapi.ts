import { Screening } from "@/lib/types";

const OCAPI_BASE = "https://vwc.curzon.com/WSVistaWebClient/ocapi/v1";
const BOOKING_BASE = "https://www.curzon.com/ticketing/seats/";
// Two pages tried in order for token extraction; any Curzon venue page works.
const TOKEN_SOURCE_URLS = [
  "https://www.curzon.com/venues/soho/",
  "https://www.curzon.com/venues/camden/",
];
const DATE_WINDOW_DAYS = 7;

/**
 * All London Curzon venues scraped by this module.
 *
 * siteId = Vista cinema code (vistaCinema.key from the Omnia API).
 * To add a new venue:
 *   1. Look up its slug on curzon.com/venues/<slug>/
 *   2. GET https://www.curzon.com/api/omnia/v1/page?friendly=/venues/<slug>/
 *      → vistaCinema.key is the siteId
 *   3. Append { siteId, name } here and add coords to src/lib/venues.ts.
 *
 * Initially Phase 1 (Soho + Camden) are active by default.
 * Set CURZON_SITE_IDS=SOH1,CAM1,MAY1,... to override.
 */
export const VENUES = [
  { siteId: "SOH1", name: "Curzon Soho" },
  { siteId: "CAM1", name: "Curzon Camden" },
  { siteId: "MAY1", name: "Curzon Mayfair" },
  { siteId: "BLO1", name: "Curzon Bloomsbury" },
  { siteId: "VIC1", name: "Curzon Victoria" },
  { siteId: "HOX1", name: "Curzon Hoxton" },
  { siteId: "RIC1", name: "Curzon Richmond" },
  { siteId: "KIN1", name: "Curzon Kingston" },
  { siteId: "WIM01", name: "Curzon Wimbledon" },
  { siteId: "ALD1", name: "Curzon Aldgate" },
] as const;

// All active London venues. Override via CURZON_SITE_IDS=SOH1,CAM1,...
const DEFAULT_SITE_IDS = ["SOH1", "CAM1", "MAY1", "BLO1", "VIC1", "HOX1", "RIC1", "KIN1", "WIM01", "ALD1"];

// ------- Auth token cache -----------------------------------------------
// The Curzon site embeds an anonymous RSA-signed JWT (~12h TTL) in every
// page's HTML under window.initialData.api.authToken.
// We cache the extracted token in-process for 1 hour (well within the TTL).
let _tokenCache: { value: string; expiresAt: number } | null = null;

async function tryExtractToken(url: string): Promise<string | null> {
  try {
    const html = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    }).then((r) => r.text());
    const match = html.match(/"authToken":"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.value;
  for (const url of TOKEN_SOURCE_URLS) {
    const token = await tryExtractToken(url);
    if (token) {
      console.log(`[curzon-ocapi] token extracted OK (source: ${url})`);
      _tokenCache = { value: token, expiresAt: Date.now() + 60 * 60 * 1000 };
      return token;
    }
    console.warn(`[curzon-ocapi] token not found at ${url}, trying fallback`);
  }
  throw new Error("curzon-ocapi: auth token not found in any source page");
}

// ------- Date helpers ---------------------------------------------------

/** Returns YYYY-MM-DD in Europe/London timezone, `offsetDays` from today. */
function londonDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // en-CA locale uses ISO-style YYYY-MM-DD output
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** Converts an ISO timestamp to London local date and 24-hour time. Exported for tests. */
export function toLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date, time };
}

// ------- Title helpers --------------------------------------------------

/**
 * The OCAPI sometimes wraps film titles in extra literal double-quotes,
 * e.g.  "\"Wuthering Heights\""  →  "Wuthering Heights".
 * Exported for tests.
 */
export function cleanFilmTitle(raw: string): string {
  return raw.trim().replace(/^"+|"+$/g, "").trim();
}

// ------- OCAPI types (minimal — only fields we use) --------------------

interface OcapiFilm {
  id: string;
  title: { text: string };
  releaseDate?: string | null;
}

interface OcapiShowtime {
  id: string;
  filmId: string;
  siteId: string;
  schedule: { startsAt: string };
  isSoldOut: boolean;
}

export interface OcapiResponse {
  showtimes?: OcapiShowtime[];
  relatedData?: { films?: OcapiFilm[] };
}

// ------- Pure transform — exported for unit tests (no network) ----------

/**
 * Transform a raw OCAPI response into Screening[].
 *
 * `seen`      – booking-URL dedup set shared across multiple date fetches.
 *              Defaults to a fresh Set so callers in tests don't need one.
 * `venueMap`  – Map<siteId, canonicalVenueName>.
 *
 * Sold-out sessions ARE included: the bookingUrl is still constructible and
 * useful for users to see what played / is sold out at their matched venue.
 */
export function transformShowtimes(
  data: OcapiResponse,
  venueMap: Map<string, string>,
  seen = new Set<string>()
): Screening[] {
  const filmMap = new Map<string, OcapiFilm>(
    (data.relatedData?.films ?? []).map((f) => [f.id, f])
  );
  const results: Screening[] = [];

  for (const s of data.showtimes ?? []) {
    const bookingUrl = `${BOOKING_BASE}${s.id}/`;
    if (seen.has(bookingUrl)) continue;
    seen.add(bookingUrl);

    const venueName = venueMap.get(s.siteId);
    if (!venueName) continue; // siteId not in our active set

    const film = filmMap.get(s.filmId);
    if (!film) continue; // orphaned showtime — relatedData missing this film

    const title = cleanFilmTitle(film.title.text);
    const year = film.releaseDate ? parseInt(film.releaseDate.slice(0, 4), 10) : null;
    const { date, time } = toLocalDateTime(s.schedule.startsAt);

    results.push({ title, year, date, time, venue: venueName, bookingUrl, format: null });
  }

  return results;
}

// ------- Network fetch --------------------------------------------------

async function fetchDateShowtimes(
  date: string,
  siteIds: readonly string[],
  token: string
): Promise<OcapiResponse> {
  // The OCAPI `siteIds` parameter is plural and accepts multiple IDs as
  // repeated query-string entries: ?siteIds=SOH1&siteIds=CAM1&...
  // This batches all venues into a single HTTP request per date, keeping
  // total requests to DATE_WINDOW_DAYS (7) regardless of venue count.
  const params = new URLSearchParams(siteIds.map((id) => ["siteIds", id]));
  const url = `${OCAPI_BASE}/showtimes/by-business-date/${date}?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 500)}` : ""}`);
  }
  return res.json() as Promise<OcapiResponse>;
}

// ------- Main exported scraper ------------------------------------------

export async function scrapeCurzonOcapi(): Promise<Screening[]> {
  // Feature flag: set ENABLE_CURZON_OCAPI=true in env to activate.
  if (process.env.ENABLE_CURZON_OCAPI !== "true") return [];

  const start = Date.now();

  // Resolve active venue set. CURZON_SITE_IDS overrides the full default list.
  const fromEnv = !!process.env.CURZON_SITE_IDS;
  const activeSiteIds = fromEnv
    ? process.env.CURZON_SITE_IDS!.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_SITE_IDS;
  console.log(`[curzon-ocapi] active siteIds (${fromEnv ? "CURZON_SITE_IDS env" : "default"}): ${activeSiteIds.join(", ")}`);
  const venueMap = new Map(
    VENUES.filter((v) => activeSiteIds.includes(v.siteId)).map((v) => [v.siteId, v.name])
  );
  const siteIds = [...venueMap.keys()];

  if (siteIds.length === 0) return [];

  // Obtain auth token (extracts from Curzon HTML; cached 1h in-process).
  let token: string;
  try {
    token = await fetchToken();
  } catch (err) {
    console.error("[curzon-ocapi] failed to fetch auth token:", err);
    return [];
  }

  // Build 7-day date window in Europe/London time.
  const dates = Array.from({ length: DATE_WINDOW_DAYS }, (_, i) => londonDate(i));

  // Single seen-set shared across all date fetches for cross-day dedup.
  const seen = new Set<string>();
  const allScreenings: Screening[] = [];

  // Fetch dates in batches of 3 (concurrency cap).
  // Each call fetches ALL active venues in one request (siteIds batched).
  // Worst-case wall time: ceil(7/3) rounds × 6s timeout = 18s — well within budget.
  for (let i = 0; i < dates.length; i += 3) {
    const batch = dates.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map((date) => fetchDateShowtimes(date, siteIds, token))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const date = batch[j];
      if (r.status === "fulfilled") {
        const screenings = transformShowtimes(r.value, venueMap, seen);
        allScreenings.push(...screenings);
        console.log(`[curzon-ocapi] ${date}: ${screenings.length} screenings`);
      } else {
        console.error(`[curzon-ocapi] ${date} failed:`, r.reason);
      }
    }
  }

  console.log(
    `[curzon-ocapi] total: ${allScreenings.length} screenings from ${siteIds.length} venues in ${Date.now() - start}ms`
  );
  return allScreenings;
}
