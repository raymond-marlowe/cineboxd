import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

// Barbican Cinema – Spektrix-first scraper
// ─────────────────────────────────────────────────────────────────────────────
// Goes directly to the Spektrix back-end that powers the Barbican ticketing
// site.  All pages are server-rendered ASP.NET; no JS required.
//
// Flow:
//   1. EventList.aspx  (current month + next month)
//      Selector  a.Event_Name  →  EventId (href) + raw title (text)
//      MonthSelect format:   YYYYM   (no leading zero)  e.g. 20262 = Feb 2026
//
//   2. Cinema filter: title must contain a BBFC certificate — (U), (PG), (12),
//      (12A), (15), (15*), (18), (R18).  Non-cinema events (concerts, tours,
//      parking passes) never have these patterns.  This avoids hitting
//      ChooseSeats.aspx at all (it uses a virtual queue that rate-limits bots).
//
//   3. EventDetails.aspx?MonthSelect=YYYYMM&EventId=X  (for each cinema EventId × 2 months)
//      Selector  select.EventDatesList option
//        value  =  EventInstanceId
//        text   =  "26 Feb 2026 - 14:30 (Thu)"  (or "… - Online booking closed")
//      MonthSelect format:   YYYYMM  (leading zero)  e.g. 202602 = Feb 2026
//
//   bookingUrl per instance = ChooseSeats URL constructed from EventInstanceId (never fetched).

const SPEKTRIX = "https://spektrix.barbican.org.uk/barbicancentre/website";
const CACHE_KEY = "barbican";
const VENUE = "Barbican Cinema";
const CONCURRENCY = 5; // max parallel EventDetails fetches

const MONTH_NUMS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// ─── URL builders ────────────────────────────────────────────────────────────

/** EventList MonthSelect: YYYYM (no leading zero). */
function eventListUrl(d: Date): string {
  return `${SPEKTRIX}/EventList.aspx?MonthSelect=${d.getFullYear()}${d.getMonth() + 1}&SortBy=Name`;
}

/** EventDetails MonthSelect: YYYYMM (leading zero). */
function eventDetailsUrl(eventId: string, d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${SPEKTRIX}/EventDetails.aspx?MonthSelect=${d.getFullYear()}${mm}&EventId=${eventId}`;
}

function chooseSeatsUrl(instanceId: string): string {
  return `${SPEKTRIX}/ChooseSeats.aspx?EventInstanceId=${instanceId}`;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Extract {eventId → rawTitle} from an EventList page.
 * Each event has two anchors; we use only the one with class "Event_Name" which
 * carries the title text and the EventDetails href.
 */
function parseEventList(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const events = new Map<string, string>();
  $("a.Event_Name").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/EventId=(\d+)/i);
    if (!m) return;
    const rawTitle = $(el).text().trim();
    if (!events.has(m[1])) events.set(m[1], rawTitle);
  });
  return events;
}

interface Instance {
  instanceId: string;
  date: string;    // YYYY-MM-DD
  time: string;    // HH:mm
  closed: boolean;
}

/**
 * Extract performance instances from an EventDetails page.
 *
 * The page contains a <select class="EventDatesList"> whose options are:
 *   <option value="3348805">26 Feb 2026 - 14:30 (Thu)</option>
 *   <option value="3350602">25 Feb 2026 - 17:45 (Wed) - Online booking closed</option>
 */
function parseEventDetails(html: string): Instance[] {
  const $ = cheerio.load(html);
  const instances: Instance[] = [];

  $("select.EventDatesList option").each((_, el) => {
    const instanceId = $(el).attr("value")?.trim();
    const text = $(el).text().trim();
    if (!instanceId || !text) return;

    // "DD Mon YYYY - HH:MM (Day)" — extract date and time
    const m = text.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})\s+-\s+(\d{2}:\d{2})/);
    if (!m) return;

    const day = parseInt(m[1], 10);
    const monthNum = MONTH_NUMS[m[2].toLowerCase()];
    if (monthNum === undefined) return;
    const year = parseInt(m[3], 10);
    const time = m[4]; // already HH:MM

    const date = `${year}-${String(monthNum + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const closed = /Online booking closed/i.test(text);

    instances.push({ instanceId, date, time, closed });
  });

  return instances;
}

/**
 * Cinema detection: does this raw title contain a BBFC film certificate?
 *
 * All Barbican cinema screenings carry a BBFC cert: (U), (PG), (12), (12A),
 * (15), (15*), (18), (R18).  Non-cinema events (concerts, tours, parking
 * passes, exhibitions) never do, so this is a reliable filter that requires
 * no additional HTTP requests.
 */
function isCinemaTitle(rawTitle: string): boolean {
  return /\((U|PG|12A?|15\*?|18|R18)\)/i.test(rawTitle);
}

// ─── Title cleaning ───────────────────────────────────────────────────────────

/**
 * Clean a raw event title from the EventList.
 *
 * Cinema films are typically wrapped in curly quotes, e.g.:
 *   "Wuthering Heights" (15) (AD)
 *   "No Other Choice" (15)
 *
 * Non-cinema events have plain names (and will be filtered out by isCinemaTitle
 * anyway, so they never reach this function in normal flow).
 *
 * Strategy:
 *   - If the string starts with a quote char (curly or straight), extract the
 *     content between the matching closing quote.
 *   - Otherwise strip trailing parentheticals (cert codes, accessibility flags).
 *   - Extract a trailing (YYYY) year either way.
 */
function cleanTitle(raw: string): { title: string; year: number | null } {
  const OPEN = ["\u201C", '"', "\u2018", "'"];
  const CLOSE = ["\u201D", '"', "\u2019", "'"];

  let s = raw.trim();

  // Try to extract the quoted portion.
  let found = false;
  for (let i = 0; i < OPEN.length; i++) {
    if (s.startsWith(OPEN[i])) {
      const closeIdx = s.indexOf(CLOSE[i], 1);
      if (closeIdx > 1) {
        s = s.slice(1, closeIdx).trim();
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // No surrounding quotes — strip up to two trailing parentheticals.
    s = s.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  // Extract year from a trailing (YYYY) in whatever remains.
  const yearMatch = s.match(/\((\d{4})\)\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (yearMatch) s = s.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return { title: s, year };
}

// ─── Network helpers ──────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.error(`[barbican] HTTP ${res.status} ${url}`);
      return null;
    }
    return res.text();
  } catch (err) {
    console.error(
      `[barbican] fetch error ${url}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Run async tasks with at most `limit` in-flight at once.
 * Returns results in the same order as the input tasks array.
 * Node.js is single-threaded so the shared `idx` counter is race-condition-free.
 */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export async function scrapeBarbican(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD for date comparisons
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // ── Step 1: collect unique EventIds + raw titles from two months ───────────
  const [listCur, listNext] = await Promise.all([
    fetchHtml(eventListUrl(now)),
    fetchHtml(eventListUrl(nextMonth)),
  ]);

  const allEvents = new Map<string, string>(); // eventId → rawTitle
  if (listCur)  parseEventList(listCur).forEach((t, id) => allEvents.set(id, t));
  if (listNext) parseEventList(listNext).forEach((t, id) => { if (!allEvents.has(id)) allEvents.set(id, t); });

  if (allEvents.size === 0) {
    console.error("[barbican] EventList returned no events — check Spektrix URLs");
    return [];
  }

  // ── Step 2: filter to cinema events by BBFC certificate in title ────────────
  // All Barbican cinema screenings carry a cert; non-cinema events never do.
  const cinemaEvents = new Map<string, string>(
    [...allEvents].filter(([, rawTitle]) => isCinemaTitle(rawTitle))
  );

  const screenings: Screening[] = [];

  // ── Step 3: fetch EventDetails for cinema events (bounded concurrency) ───────
  const eventIds = [...cinemaEvents.keys()];

  const detailTasks = eventIds.map((eventId) => async (): Promise<void> => {
    try {
      const [detailCur, detailNext] = await Promise.all([
        fetchHtml(eventDetailsUrl(eventId, now)),
        fetchHtml(eventDetailsUrl(eventId, nextMonth)),
      ]);

      const seenIds = new Set<string>();
      const allInstances: Instance[] = [];
      for (const html of [detailCur, detailNext]) {
        if (!html) continue;
        for (const inst of parseEventDetails(html)) {
          if (!seenIds.has(inst.instanceId)) {
            seenIds.add(inst.instanceId);
            allInstances.push(inst);
          }
        }
      }

      const open = allInstances.filter((i) => !i.closed && i.date >= todayStr);
      if (open.length === 0) return;

      const { title, year } = cleanTitle(cinemaEvents.get(eventId)!);
      for (const inst of open) {
        screenings.push({
          title,
          year,
          date: inst.date,
          time: inst.time,
          venue: VENUE,
          bookingUrl: chooseSeatsUrl(inst.instanceId),
          format: null,
        });
      }
    } catch (err) {
      console.error(
        `[barbican] error processing EventId ${eventId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  });

  await withConcurrency(detailTasks, CONCURRENCY);

  console.log(
    `[barbican] ${screenings.length} screenings from ${cinemaEvents.size}/${allEvents.size} cinema events`
  );
  if (screenings.length > 0) setCache(CACHE_KEY, screenings);
  return screenings;
}
