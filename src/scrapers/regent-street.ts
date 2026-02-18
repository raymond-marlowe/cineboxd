import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const CACHE_KEY = "regent-street";
const VENUE = "Regent Street Cinema";
const GRAPHQL_URL = "https://api-uk.indy.systems/graphql";
const SITEMAP_URL = "https://www.regentstreetcinema.com/sitemap.xml";
const BOOKING_BASE = "https://www.regentstreetcinema.com/checkout/showing/";
const SITE_ID = 85;

// Regent Street Cinema uses the Indy Systems SPA platform.
// Data comes from the GraphQL API at api-uk.indy.systems (no auth required for these queries).
//   Stage 1: sitemap.xml → /movie/{slug}/ URLs → unique slugs
//   Stage 2: findMovieBySlug(urlSlug, siteIds:[85]) → { id, name }
//   Stage 3: movie(id) { showings { id, time, published, showingBadges } } → filter future+published
//   Booking URL: https://www.regentstreetcinema.com/checkout/showing/{showingId}

const GQL_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0",
  Origin: "https://www.regentstreetcinema.com",
  Referer: "https://www.regentstreetcinema.com/",
};

// Convert UTC ISO timestamp to London date + HH:MM (handles BST / GMT automatically)
function utcToLondon(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

// Process items through async fn in sequential chunks of `size`,
// parallelising within each chunk — avoids hammering the GraphQL endpoint.
async function inChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    const settled = await Promise.allSettled(items.slice(i, i + size).map(fn));
    out.push(...settled);
  }
  return out;
}

async function gqlQuery(query: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: GQL_HEADERS,
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function scrapeRegentStreet(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  // Stage 1: sitemap → unique movie slugs
  const sitemapXml = await fetch(SITEMAP_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());
  const slugs = [
    ...new Set(
      [...sitemapXml.matchAll(/\/movie\/([^/]+)\//g)].map((m) => m[1])
    ),
  ];

  // Stage 2: slug → { id, name } via findMovieBySlug (20 concurrent)
  type MovieInfo = { id: string; name: string };
  const movieResults = await inChunks(slugs, 20, async (slug) => {
    const json = await gqlQuery(
      `query { findMovieBySlug(urlSlug:"${slug}",siteIds:[${SITE_ID}]) { id name } }`
    );
    const m = json?.data?.findMovieBySlug;
    if (!m?.id) throw new Error("not found");
    // The API sometimes wraps the name in literal double-quotes
    return { id: m.id, name: (m.name as string).replace(/^"|"$/g, "").trim() } as MovieInfo;
  });

  const movies = movieResults
    .filter((r): r is PromiseFulfilledResult<MovieInfo> => r.status === "fulfilled")
    .map((r) => r.value);

  // Stage 3: movie(id) → showings, filter future + published (10 concurrent)
  const now = new Date().toISOString();
  const screenings: Screening[] = [];

  await inChunks(movies, 10, async (movie) => {
    const json = await gqlQuery(
      `query { movie(id:${movie.id}) { showings { id time published showingBadges { displayName } } } }`
    );
    type Showing = {
      id: string;
      time: string;
      published: boolean;
      showingBadges: { displayName: string }[];
    };
    for (const s of (json?.data?.movie?.showings ?? []) as Showing[]) {
      if (!s.published || s.time <= now) continue;
      const { date, time } = utcToLondon(s.time);
      const yearMatch = movie.name.match(/\((\d{4})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const title = yearMatch
        ? movie.name.replace(/\s*\(\d{4}\)\s*$/, "").trim()
        : movie.name;
      const format =
        s.showingBadges
          .map((b) => b.displayName)
          .filter(Boolean)
          .join(", ") || null;
      screenings.push({
        title,
        year,
        date,
        time,
        venue: VENUE,
        bookingUrl: BOOKING_BASE + s.id,
        format,
      });
    }
  });

  setCache(CACHE_KEY, screenings);
  return screenings;
}
