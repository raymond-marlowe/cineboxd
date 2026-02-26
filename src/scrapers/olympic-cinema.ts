import * as cheerio from "cheerio";
import { Screening } from "@/lib/types";
import { getCached, setCache } from "@/lib/cache";

const CACHE_KEY = "olympic-cinema";
const LOOKAHEAD_DAYS = 60;
const MAX_IDS_PER_VENUE = 200;
const SHOWTIME_CONCURRENCY = 8;
const DISCOVERY_CONCURRENCY = 8;
const DEBUG = process.env.DEBUG_OLYMPIC === "1";

const FETCH_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
};

const OLYMPIC_VENUES = [
  {
    host: "web1.empire.mycloudcinema.com",
    venue: "Olympic Cinema (Barnes)",
    whatsOnUrl: "https://www.olympiccinema.com/whats-on",
  },
  {
    host: "web2.empire.mycloudcinema.com",
    venue: "The Cinema in the Power Station",
    whatsOnUrl: "https://www.thecinemainthepowerstation.com/whats-on",
  },
  {
    host: "web3.empire.mycloudcinema.com",
    venue: "The Cinema at Selfridges",
    whatsOnUrl: "https://www.thecinemaatselfridges.com/whats-on",
  },
] as const;

type OlympicVenueConfig = (typeof OLYMPIC_VENUES)[number];
type OlympicVenueName = OlympicVenueConfig["venue"];
type OlympicHost = OlympicVenueConfig["host"];

interface ShowtimeApiItem {
  title?: unknown;
  show_time?: unknown;
  bookable?: unknown;
  sold_out?: unknown;
  allow_purchases?: unknown;
}

function londonDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function toLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
    time: d.toLocaleTimeString("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function inWindow(date: string): boolean {
  const start = londonDate(0);
  const end = londonDate(LOOKAHEAD_DAYS);
  return date >= start && date <= end;
}

function toAbsolute(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function normalizeHref(url: string): string {
  const noHash = url.split("#")[0];
  return noHash.endsWith("/") ? noHash.slice(0, -1) : noHash;
}

function looksLikeDetailPath(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  if (/\/whats-on\/?$/i.test(pathname)) return false;
  if (/\.(?:css|js|json|jpg|jpeg|png|webp|svg|gif|ico|pdf|xml)$/i.test(pathname)) return false;
  if (/\/(account|login|signup|cart|checkout|privacy|terms|contact|about|blog|news)\b/i.test(pathname)) return false;

  if (/\/(film|films|movie|movies|event|events|programme|program|showing|showings)\b/i.test(pathname)) {
    return true;
  }

  const segs = pathname.split("/").filter(Boolean);
  return segs.length >= 1 && segs[segs.length - 1].length >= 4;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return out;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.error(`[olympic] fetch failed: ${url} (HTTP ${res.status})`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[olympic] fetch error: ${url}`, err);
    return null;
  }
}

function extractDetailLinks(whatsOnHtml: string, whatsOnUrl: string): string[] {
  const links = new Set<string>();
  const $ = cheerio.load(whatsOnHtml);
  const origin = new URL(whatsOnUrl).origin;
  const whatsOnNorm = normalizeHref(whatsOnUrl);

  $('a[href]').each((_, a) => {
    const href = toAbsolute($(a).attr("href"), whatsOnUrl);
    if (!href) return;
    if (!href.startsWith(origin)) return;

    const norm = normalizeHref(href);
    if (norm === whatsOnNorm) return;

    let u: URL;
    try {
      u = new URL(href);
    } catch {
      return;
    }
    if (looksLikeDetailPath(u.pathname)) links.add(norm);
  });

  const src = whatsOnHtml.replace(/\\\//g, "/");
  for (const m of src.match(/https?:\/\/[^\s"'<>]+/gi) ?? []) {
    const abs = toAbsolute(m, whatsOnUrl);
    if (!abs) continue;
    const norm = normalizeHref(abs);
    if (norm === whatsOnNorm) continue;
    const u = new URL(abs);
    if (u.origin !== origin) continue;
    if (looksLikeDetailPath(u.pathname)) links.add(norm);
  }

  return [...links];
}

function extractBookingIdsForHost(html: string, host: OlympicHost): string[] {
  const ids = new Set<string>();
  const escaped = host.replace(/\./g, "\\.");
  const rx = new RegExp(`https:\\/\\/${escaped}\\/\\#\\/book\\/(\\d+)`, "gi");

  const collect = (text: string) => {
    for (const m of text.matchAll(rx)) ids.add(m[1]);
  };

  collect(html);
  collect(html.replace(/\\\//g, "/"));

  const $ = cheerio.load(html);
  $('a[href*="empire.mycloudcinema.com/#/book/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    collect(href);
  });

  return [...ids];
}

async function discoverVenueBookingIds(config: OlympicVenueConfig): Promise<string[]> {
  const whatsOnHtml = await fetchHtml(config.whatsOnUrl);
  if (!whatsOnHtml) {
    if (DEBUG) console.log(`[olympic] discovered ${config.venue}: ids=0`);
    if (config.host === "web1.empire.mycloudcinema.com") {
      console.error("[olympic] Barnes blocked/empty");
    }
    return [];
  }

  const detailUrls = extractDetailLinks(whatsOnHtml, config.whatsOnUrl);
  const ids = new Set<string>();

  for (const id of extractBookingIdsForHost(whatsOnHtml, config.host)) {
    if (ids.size >= MAX_IDS_PER_VENUE) break;
    ids.add(id);
  }

  await mapLimit(detailUrls, DISCOVERY_CONCURRENCY, async (detailUrl) => {
    if (ids.size >= MAX_IDS_PER_VENUE) return;
    const html = await fetchHtml(detailUrl);
    if (!html) return;
    for (const id of extractBookingIdsForHost(html, config.host)) {
      if (ids.size >= MAX_IDS_PER_VENUE) break;
      ids.add(id);
    }
  });

  const list = [...ids].slice(0, MAX_IDS_PER_VENUE);
  if (DEBUG) {
    const firstUrls = list.slice(0, 3).map((id) => `https://${config.host}/#/book/${id}`);
    console.log(
      `[olympic] discovered ${config.venue}: ids=${list.length}${
        firstUrls.length ? ` first=${firstUrls.join(", ")}` : ""
      }`
    );
  }
  if (list.length === 0 && config.host === "web1.empire.mycloudcinema.com") {
    console.error("[olympic] Barnes blocked/empty");
  }
  return list;
}

function getFirstShowtimeItem(payload: unknown): ShowtimeApiItem | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { data?: unknown };

  if (Array.isArray(root.data) && root.data.length > 0 && root.data[0] && typeof root.data[0] === "object") {
    return root.data[0] as ShowtimeApiItem;
  }
  if (Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === "object") {
    return payload[0] as ShowtimeApiItem;
  }
  return null;
}

async function fetchShowtime(host: OlympicHost, id: string, venue: OlympicVenueName): Promise<Screening | null> {
  const ts = Math.floor(Date.now() / 1000);
  const endpoint = `https://${host}/webservices/show_times/get?id=${id}&ignore_bookable=false&ts=${ts}`;

  try {
    const res = await fetch(endpoint, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.error(`[olympic] show_time fetch failed: ${endpoint} (HTTP ${res.status})`);
      return null;
    }

    const payload = (await res.json()) as unknown;
    const item = getFirstShowtimeItem(payload);
    if (!item) return null;
    if (typeof item.title !== "string" || typeof item.show_time !== "string") return null;

    const { date, time } = toLocalDateTime(item.show_time);
    if (!inWindow(date)) return null;

    const soldOut = item.sold_out === true;
    const bookable = item.bookable !== false && item.allow_purchases !== false;
    const bookingUrl = !bookable || soldOut ? null : `https://${host}/#/book/${id}`;

    return {
      title: item.title.trim(),
      year: null,
      date,
      time,
      venue,
      bookingUrl,
      format: null,
    };
  } catch (err) {
    console.error(`[olympic] show_time fetch error: ${endpoint}`, err);
    return null;
  }
}

export async function scrapeOlympicCinema(): Promise<Screening[]> {
  const cached = getCached<Screening[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const discoveredLists = await Promise.all(
      OLYMPIC_VENUES.map(async (config) => ({
        config,
        ids: await discoverVenueBookingIds(config),
      }))
    );

    const tasks: { host: OlympicHost; venue: OlympicVenueName; id: string }[] = [];
    for (const entry of discoveredLists) {
      for (const id of entry.ids) {
        tasks.push({ host: entry.config.host, venue: entry.config.venue, id });
      }
    }

    const resolved = await mapLimit(tasks, SHOWTIME_CONCURRENCY, async (task) =>
      fetchShowtime(task.host, task.id, task.venue)
    );

    const seen = new Set<string>();
    const screenings: Screening[] = [];
    for (const s of resolved) {
      if (!s) continue;
      const key = s.bookingUrl ?? `${s.title}|${s.date}|${s.time}|${s.venue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      screenings.push(s);
    }

    setCache(CACHE_KEY, screenings);
    return screenings;
  } catch (err) {
    console.error("[olympic] scraper error:", err);
    return [];
  }
}
