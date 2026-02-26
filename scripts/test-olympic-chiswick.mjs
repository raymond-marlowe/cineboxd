import * as cheerio from "cheerio";

const LOOKAHEAD_DAYS = 60;
const MAX_IDS_PER_VENUE = 200;
const SHOWTIME_CONCURRENCY = 8;
const DISCOVERY_CONCURRENCY = 8;
const DEBUG = process.env.DEBUG_OLYMPIC === "1";

const HEADERS = {
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
];

function londonDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function toLocalDateTime(iso) {
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

function inWindow(date) {
  return date >= londonDate(0) && date <= londonDate(LOOKAHEAD_DAYS);
}

function toAbsolute(url, base) {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function normalizeHref(url) {
  const noHash = url.split("#")[0];
  return noHash.endsWith("/") ? noHash.slice(0, -1) : noHash;
}

function looksLikeDetailPath(pathname) {
  if (!pathname || pathname === "/") return false;
  if (/\/whats-on\/?$/i.test(pathname)) return false;
  if (/\.(?:css|js|json|jpg|jpeg|png|webp|svg|gif|ico|pdf|xml)$/i.test(pathname)) return false;
  if (/\/(account|login|signup|cart|checkout|privacy|terms|contact|about|blog|news)\b/i.test(pathname)) return false;
  if (/\/(film|films|movie|movies|event|events|programme|program|showing|showings)\b/i.test(pathname)) return true;
  const segs = pathname.split("/").filter(Boolean);
  return segs.length >= 1 && segs[segs.length - 1].length >= 4;
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.log(`[olympic] fetch failed: ${url} (HTTP ${res.status})`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.log(`[olympic] fetch error: ${url} (${err?.message ?? err})`);
    return null;
  }
}

function extractDetailLinks(whatsOnHtml, whatsOnUrl) {
  const links = new Set();
  const $ = cheerio.load(whatsOnHtml);
  const origin = new URL(whatsOnUrl).origin;
  const whatsOnNorm = normalizeHref(whatsOnUrl);

  $('a[href]').each((_, a) => {
    const href = toAbsolute($(a).attr("href"), whatsOnUrl);
    if (!href || !href.startsWith(origin)) return;
    const norm = normalizeHref(href);
    if (norm === whatsOnNorm) return;
    const u = new URL(href);
    if (looksLikeDetailPath(u.pathname)) links.add(norm);
  });

  const src = whatsOnHtml.replace(/\\\//g, "/");
  for (const m of src.match(/https?:\/\/[^\s"'<>]+/gi) ?? []) {
    const abs = toAbsolute(m, whatsOnUrl);
    if (!abs) continue;
    const norm = normalizeHref(abs);
    if (norm === whatsOnNorm) continue;
    const u = new URL(abs);
    if (u.origin === origin && looksLikeDetailPath(u.pathname)) links.add(norm);
  }

  return [...links];
}

function extractBookingIdsForHost(html, host) {
  const ids = new Set();
  const escaped = host.replace(/\./g, "\\.");
  const rx = new RegExp(`https:\\/\\/${escaped}\\/\\#\\/book\\/(\\d+)`, "gi");
  const collect = (text) => {
    for (const m of text.matchAll(rx)) ids.add(m[1]);
  };
  collect(html);
  collect(html.replace(/\\\//g, "/"));
  const $ = cheerio.load(html);
  $('a[href*="empire.mycloudcinema.com/#/book/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (href) collect(href);
  });
  return [...ids];
}

async function discoverVenueIds(config) {
  const whatsOnHtml = await fetchHtml(config.whatsOnUrl);
  if (!whatsOnHtml) {
    if (DEBUG) console.log(`[olympic] discovered ${config.venue}: ids=0`);
    if (config.host === "web1.empire.mycloudcinema.com") console.log("[olympic] Barnes blocked/empty");
    return [];
  }

  const ids = new Set();
  for (const id of extractBookingIdsForHost(whatsOnHtml, config.host)) {
    if (ids.size >= MAX_IDS_PER_VENUE) break;
    ids.add(id);
  }

  const details = extractDetailLinks(whatsOnHtml, config.whatsOnUrl);
  await mapLimit(details, DISCOVERY_CONCURRENCY, async (detailUrl) => {
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
    console.log(`[olympic] discovered ${config.venue}: ids=${list.length}`);
    if (firstUrls.length > 0) firstUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  }
  if (config.host === "web1.empire.mycloudcinema.com" && list.length === 0) {
    console.log("[olympic] Barnes blocked/empty");
  }
  return list;
}

function firstItem(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload.data) && payload.data[0] && typeof payload.data[0] === "object") return payload.data[0];
  if (Array.isArray(payload) && payload[0] && typeof payload[0] === "object") return payload[0];
  return null;
}

async function fetchShowtime(host, id, venue) {
  const ts = Math.floor(Date.now() / 1000);
  const endpoint = `https://${host}/webservices/show_times/get?id=${id}&ignore_bookable=false&ts=${ts}`;
  try {
    const res = await fetch(endpoint, { headers: HEADERS });
    if (!res.ok) return null;
    const payload = await res.json();
    const item = firstItem(payload);
    if (!item || typeof item.title !== "string" || typeof item.show_time !== "string") return null;
    const { date, time } = toLocalDateTime(item.show_time);
    if (!inWindow(date)) return null;
    const soldOut = item.sold_out === true;
    const bookable = item.bookable !== false && item.allow_purchases !== false;
    return {
      title: item.title.trim(),
      year: null,
      date,
      time,
      venue,
      bookingUrl: !bookable || soldOut ? null : `https://${host}/#/book/${id}`,
      format: null,
    };
  } catch {
    return null;
  }
}

async function runOlympic() {
  const discovered = await Promise.all(
    OLYMPIC_VENUES.map(async (cfg) => ({ cfg, ids: await discoverVenueIds(cfg) }))
  );
  const tasks = [];
  discovered.forEach(({ cfg, ids }) => ids.forEach((id) => tasks.push({ ...cfg, id })));

  const resolved = await mapLimit(tasks, SHOWTIME_CONCURRENCY, (t) => fetchShowtime(t.host, t.id, t.venue));
  const seen = new Set();
  const byVenue = new Map(OLYMPIC_VENUES.map((v) => [v.venue, []]));
  for (const s of resolved) {
    if (!s) continue;
    const key = s.bookingUrl ?? `${s.title}|${s.date}|${s.time}|${s.venue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byVenue.get(s.venue).push(s);
  }
  return { byVenue, discovered };
}

async function runChiswick() {
  const res = await fetch("https://www.chiswickcinema.co.uk/whats-on", { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const movieLinks = new Set();
  $('a[href*="/movie/"]').each((_, a) => {
    const href = toAbsolute($(a).attr("href"), "https://www.chiswickcinema.co.uk");
    if (href) movieLinks.add(href.split("#")[0].split("?")[0]);
  });
  return { count: movieLinks.size };
}

async function main() {
  console.log("\n=== Olympic (MyCloudCinema) ===");
  const { byVenue } = await runOlympic();
  for (const venue of OLYMPIC_VENUES.map((v) => v.venue)) {
    const rows = byVenue.get(venue) ?? [];
    console.log(`\n- ${venue}`);
    console.log(`  resolved screenings: ${rows.length}`);
    rows.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title} | ${s.date} ${s.time} | ${s.bookingUrl ?? "sold out/unbookable"}`);
    });
  }

  console.log("\n=== Chiswick Cinema ===");
  try {
    const c = await runChiswick();
    console.log(`count: ${c.count}`);
  } catch (err) {
    console.log(`error: ${err?.message ?? err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
