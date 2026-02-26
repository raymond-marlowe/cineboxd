import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// BFI Southbank uses AudienceView Unlimited for ticketing at whatson.bfi.org.uk.
// There is no public JSON API; instead, AudienceView embeds a JS object literal
// `var articleContext = { searchNames: [...], searchResults: [[...], ...] }` into
// each listing/film page.  We fetch several listing permalinks plus any highlighted
// individual film pages, extract & parse that object, and normalise to Screening[].
//
// Key URL shape:
//   https://whatson.bfi.org.uk/Online/default.asp
//     ?BOparam::WScontent::loadArticle::permalink=<slug>
//
// Useful searchNames fields (others may be present and are ignored):
//   short_description  — film title (may have a "Preview: " prefix)
//   start_date_date    — YYYY-MM-DD  (preferred)
//   start_date         — full date/datetime string (fallback)
//   start_date_time    — HH:mm (24-hour)
//   venue_name         — screen name, e.g. "NFT1", "NFT2 Southbank"
//   additional_info    — relative URL to booking page
//
// Cinema-screen filter: keep rows where venue_name matches /NFT\d?/i.
// Drop library, archive, or other non-cinema venues.

const ONLINE_BASE = "https://whatson.bfi.org.uk/Online";
const BASE_URL = `${ONLINE_BASE}/default.asp`;
const CACHE_KEY = "bfi-southbank";
const VENUE = "BFI Southbank";

// Listing permalink pages to scrape.  Edit this array to add/remove sections.
const LISTING_PERMALINKS = [
  "filmsindex",
  "new-releases",
  "re-releases",
  "big-screen-classics",
  "families",
  "previews-and-events",
] as const;

// Max individual film highlight pages to fetch (prevents runaway concurrency).
const MAX_HIGHLIGHT_PAGES = 25;

// Max concurrent in-flight requests when fetching highlight pages.
const CONCURRENCY_LIMIT = 5;

// BFI Southbank's whatson domain sits behind Cloudflare bot protection.
// Server-side fetch() is blocked with a JS challenge (403 "Just a moment…")
// unless a valid cf_clearance cookie is supplied.
//
// To unblock locally or in production:
//   1. Visit https://whatson.bfi.org.uk in your browser (challenge auto-solves).
//   2. DevTools → Application → Cookies → copy the `cf_clearance` value.
//   3. Set BFI_CF_CLEARANCE=<value> in your .env.local (or production env vars).
//   The cookie is IP-tied and expires in ~30 min – refresh whenever it stops working.
function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    Referer: "https://whatson.bfi.org.uk/",
  };
  const cfClearance = process.env.BFI_CF_CLEARANCE?.trim();
  if (cfClearance) {
    h["Cookie"] = `cf_clearance=${cfClearance}`;
  }
  return h;
}

// ─── URL helpers ────────────────────────────────────────────────────────────

function permalinkUrl(slug: string): string {
  return `${BASE_URL}?BOparam::WScontent::loadArticle::permalink=${slug}`;
}

function makeAbsoluteUrl(path: unknown): string | null {
  if (typeof path !== "string" || !path.trim()) return null;
  const p = path.trim();
  if (p.startsWith("http")) return p;
  // path is relative to /Online/ e.g. "default.asp?doWork::..."
  return `${ONLINE_BASE}/${p.replace(/^\/+/, "")}`;
}

// ─── articleContext extraction ───────────────────────────────────────────────

/**
 * Walk the HTML character-by-character to pull the full JS object literal for
 * `var articleContext = { ... }`.  Balanced-brace counting means nested objects
 * and arrays are captured correctly.  String literals (single and double quoted)
 * are skipped so inner braces don't confuse the depth counter.
 */
function extractRawContextJs(html: string): string | null {
  const MARKER = "var articleContext =";
  const markerIdx = html.indexOf(MARKER);
  if (markerIdx === -1) return null;

  const braceStart = html.indexOf("{", markerIdx + MARKER.length);
  if (braceStart === -1) return null;

  let depth = 0;
  let i = braceStart;

  while (i < html.length) {
    const ch = html[i];

    // Skip over string literals so inner braces are not counted.
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < html.length) {
        if (html[i] === "\\") { i += 2; continue; } // skip escape sequence
        if (html[i] === q) { i++; break; }
        i++;
      }
      continue;
    }

    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return html.slice(braceStart, i + 1);
    }

    i++;
  }

  return null; // unbalanced — should not happen
}

/**
 * Best-effort conversion of a JS object literal to valid JSON so we can
 * JSON.parse it.  Handles:
 *   • Unquoted object keys  (identifier: → "identifier":)
 *   • Single-quoted strings ('value' → "value")
 *   • Trailing commas before ] or }
 *   • Bare JS-only tokens: undefined / NaN / Infinity → null
 */
function jsToJson(js: string): string {
  return js
    // Quote unquoted object keys.  Pattern: after { or , (and optional
    // whitespace), a bare identifier followed by a colon.
    .replace(/([{,\[])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1 "$2":')
    // Replace single-quoted strings with double-quoted equivalents.
    // Captures the raw inner content (handling \'  escapes) and uses
    // JSON.stringify to produce a correctly escaped double-quoted string.
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, inner: string) =>
      JSON.stringify(inner.replace(/\\'/g, "'"))
    )
    // Strip trailing commas before closing brackets/braces.
    .replace(/,(\s*[}\]])/g, "$1")
    // Replace JS-only literals with JSON null.
    .replace(/:\s*undefined\b/g, ": null")
    .replace(/:\s*NaN\b/g, ": null")
    .replace(/:\s*Infinity\b/g, ": null");
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

/** Minimal shape of a decoded articleContext row. */
interface ContextRow {
  short_description?: unknown;
  start_date_date?: unknown;
  start_date?: unknown;
  start_date_time?: unknown;
  venue_name?: unknown;
  additional_info?: unknown;
  context_id?: unknown;
  [key: string]: unknown;
}

/**
 * Extract `var articleContext` from the HTML, convert to JSON, and zip
 * searchNames / searchResults into an array of plain row objects.
 * Returns [] (never throws) if anything is missing or malformed.
 */
function parseArticleContext(html: string): ContextRow[] {
  const raw = extractRawContextJs(html);
  if (!raw) return [];

  let ctx: { searchNames?: unknown; searchResults?: unknown };
  try {
    ctx = JSON.parse(jsToJson(raw));
  } catch {
    // jsToJson conversion failed on this page — skip silently.
    return [];
  }

  const names = ctx.searchNames;
  const results = ctx.searchResults;
  if (!Array.isArray(names) || !Array.isArray(results)) return [];

  return results.map((row) => {
    const obj: Record<string, unknown> = {};
    names.forEach((name, idx) => {
      if (typeof name !== "string") return;
      // searchResults rows may be arrays (positional) or objects (keyed).
      obj[name] = Array.isArray(row)
        ? row[idx]
        : (row as Record<string, unknown>)[name];
    });
    return obj as ContextRow;
  });
}

// ─── Field helpers ───────────────────────────────────────────────────────────

/** Validate and normalise a date value to YYYY-MM-DD in Europe/London. */
function parseDate(val: unknown): string | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const s = val.trim();
  // Already in YYYY-MM-DD — accept as-is (AudienceView usually provides this).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Fall back to Date parsing (handles "01 Mar 2026", ISO strings, etc.).
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // en-CA locale gives "YYYY-MM-DD" format.
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** Validate a time string and normalise to HH:mm. */
function parseTime(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Extract a display label for the screen from venue_name.
 * e.g. "BFI Southbank NFT1" → "NFT1",  "NFT2 Southbank" → "NFT2".
 */
function screenFormat(venueName: unknown): string | null {
  if (typeof venueName !== "string") return null;
  const m = venueName.match(/NFT\s*\d?/i);
  return m ? m[0].replace(/\s+/g, "") : null;
}

/**
 * Strip common BFI listing prefixes from film titles so the cleaned title
 * matches Letterboxd entries more reliably.
 */
function cleanTitle(raw: string): string {
  return raw.replace(/^Preview\s*:\s*/i, "").trim();
}

/** Return true for BFI cinema screens (NFT1 / NFT2 / NFT3). */
function isCinemaScreen(venueName: unknown): boolean {
  return typeof venueName === "string" && /NFT\s*\d?/i.test(venueName);
}

// ─── Row → Screening ─────────────────────────────────────────────────────────

function rowToScreening(row: ContextRow): Screening | null {
  if (!isCinemaScreen(row.venue_name)) return null;

  const rawTitle =
    typeof row.short_description === "string" ? row.short_description.trim() : "";
  if (!rawTitle) return null;

  const date =
    parseDate(row.start_date_date) ?? parseDate(row.start_date);
  if (!date) return null;

  const time = parseTime(row.start_date_time);
  if (!time) return null;

  const bookingUrl = makeAbsoluteUrl(row.additional_info);

  // Extract year from title suffix "(2025)" if present.
  const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const title = cleanTitle(
    yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim() : rawTitle
  );

  return {
    title,
    year,
    date,
    time,
    venue: VENUE,
    bookingUrl,
    format: screenFormat(row.venue_name),
  };
}

// ─── Highlight permalink extraction ─────────────────────────────────────────

/**
 * Scan HTML for AudienceView permalink links that are NOT one of the standard
 * listing pages.  These are individual film pages that may contain their own
 * articleContext with per-film screening rows (used for "highlighted" / featured
 * films whose showings might not appear in the main listing results).
 *
 * Matches both the unencoded (`permalink=hamnet`) and URL-encoded
 * (`permalink%3Dhamnet`) forms that appear in HTML href attributes.
 */
function extractHighlightPermalinks(html: string): string[] {
  const found = new Set<string>();
  const re = /permalink(?:=|%3D)([A-Za-z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!(LISTING_PERMALINKS as readonly string[]).includes(slug)) {
      found.add(slug);
    }
  }
  return [...found];
}

// ─── Network helpers ─────────────────────────────────────────────────────────

/** Fetch a URL; returns the HTML string or null on any error. */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) {
      const snippet = await res
        .text()
        .catch(() => "")
        .then((t) => t.slice(0, 200).replace(/\s+/g, " "));
      console.error(
        `[bfi-southbank] HTTP ${res.status} for ${url}${snippet ? ` — ${snippet}` : ""}`
      );
      return null;
    }
    return res.text();
  } catch (err) {
    console.error(
      `[bfi-southbank] Fetch error for ${url}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Run an array of async tasks with at most `limit` in-flight at once.
 * Node.js is single-threaded so the shared `idx` counter is safe.
 */
async function withConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number
): Promise<void> {
  if (tasks.length === 0) return;
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      await task();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export async function scrapeBFISouthbank(): Promise<Screening[]> {
  // ⚠️  DISABLED — whatson.bfi.org.uk sits behind Cloudflare bot protection.
  // Every server-side fetch() receives a 403 JS-challenge ("Just a moment…")
  // and never reaches the AudienceView HTML that contains `var articleContext`.
  //
  // To re-enable: set BFI_CF_CLEARANCE=<cookie value> in .env.local (copy from
  // a browser session on whatson.bfi.org.uk) AND remove the early return below.
  // See scraper comments above buildHeaders() for full instructions.
  //
  // TODO: replace with a Cloudflare-bypass proxy (ScraperAPI etc.) for a
  //       durable production solution.
  if (process.env.BFI_CF_CLEARANCE === undefined) {
    return [];
  }

  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  // Dedup set — keyed by bookingUrl (if present) or "venue|date|time|title".
  const seen = new Set<string>();
  const screenings: Screening[] = [];

  function addRows(rows: ContextRow[]): void {
    for (const row of rows) {
      const s = rowToScreening(row);
      if (!s) continue;
      const key =
        s.bookingUrl ?? `${VENUE}|${s.date}|${s.time}|${s.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      screenings.push(s);
    }
  }

  // ── Step 1: Fetch all listing permalink pages in parallel ──────────────────
  const listingResults = await Promise.allSettled(
    LISTING_PERMALINKS.map((slug) => fetchPage(permalinkUrl(slug)))
  );

  let filmsindexHtml: string | null = null;

  for (let i = 0; i < listingResults.length; i++) {
    const r = listingResults[i];
    if (r.status === "rejected") {
      console.error(
        `[bfi-southbank] ${LISTING_PERMALINKS[i]} promise rejected:`,
        r.reason
      );
      continue;
    }
    const html = r.value;
    if (!html) continue; // fetchPage already logged the error

    // Keep the filmsindex HTML for highlight extraction below.
    if (i === 0) filmsindexHtml = html;

    addRows(parseArticleContext(html));
  }

  // ── Step 2: Extract + fetch highlighted individual film pages ──────────────
  // Featured/highlighted films on the listing pages link to individual film
  // permalinks (e.g. permalink=hamnet).  Those pages embed their own
  // articleContext with screenings that may not appear in the listing results.
  if (filmsindexHtml) {
    const highlights = extractHighlightPermalinks(filmsindexHtml).slice(
      0,
      MAX_HIGHLIGHT_PAGES
    );

    if (highlights.length > 0) {
      const tasks = highlights.map(
        (slug) => async (): Promise<void> => {
          const html = await fetchPage(permalinkUrl(slug));
          if (html) addRows(parseArticleContext(html));
        }
      );
      await withConcurrency(tasks, CONCURRENCY_LIMIT);
    }
  }

  // Only cache if we got at least something (avoids caching a total outage).
  if (screenings.length > 0) setCache(CACHE_KEY, screenings);

  return screenings;
}
