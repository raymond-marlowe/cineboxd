// Test script for batch-3 scrapers: Regent Street Cinema, Rich Mix, JW3
// Run: node scripts/test-scrapers-batch3.mjs
import * as cheerio from 'cheerio';

// ── Regent Street Cinema (Indy Systems GraphQL) ─────────────────────────────
async function testRegentStreet() {
  const GRAPHQL_URL = 'https://api-uk.indy.systems/graphql';
  const SITEMAP_URL = 'https://www.regentstreetcinema.com/sitemap.xml';
  const BOOKING_BASE = 'https://www.regentstreetcinema.com/checkout/showing/';
  const SITE_ID = 85;
  const GQL_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://www.regentstreetcinema.com',
    'Referer': 'https://www.regentstreetcinema.com/',
  };

  function utcToLondon(iso) {
    const dt = new Date(iso);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(dt);
    const get = t => parts.find(p => p.type === t)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  }

  async function gql(query) {
    const res = await fetch(GRAPHQL_URL, { method: 'POST', headers: GQL_HEADERS, body: JSON.stringify({ query }) });
    return res.json();
  }

  // Chunked parallel execution
  async function inChunks(items, size, fn) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      const settled = await Promise.allSettled(items.slice(i, i + size).map(fn));
      out.push(...settled);
    }
    return out;
  }

  const sitemapXml = await fetch(SITEMAP_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
  const slugs = [...new Set([...sitemapXml.matchAll(/\/movie\/([^/]+)\//g)].map(m => m[1]))];
  console.log(`\n===== REGENT STREET CINEMA =====`);
  console.log(`Sitemap slugs: ${slugs.length}`);

  const movieResults = await inChunks(slugs, 20, async slug => {
    const json = await gql(`query { findMovieBySlug(urlSlug:"${slug}",siteIds:[${SITE_ID}]) { id name } }`);
    const m = json?.data?.findMovieBySlug;
    if (!m?.id) throw new Error('not found');
    return { id: m.id, name: m.name.replace(/^"|"$/g, '').trim() };
  });
  const movies = movieResults.filter(r => r.status === 'fulfilled').map(r => r.value);
  console.log(`Movies resolved: ${movies.length}`);

  const now = new Date().toISOString();
  const screenings = [];
  await inChunks(movies, 10, async movie => {
    const json = await gql(`query { movie(id:${movie.id}) { showings { id time published showingBadges { displayName } } } }`);
    for (const s of json?.data?.movie?.showings ?? []) {
      if (!s.published || s.time <= now) continue;
      const { date, time } = utcToLondon(s.time);
      const yearMatch = movie.name.match(/\((\d{4})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const title = yearMatch ? movie.name.replace(/\s*\(\d{4}\)\s*$/, '').trim() : movie.name;
      const format = s.showingBadges.map(b => b.displayName).filter(Boolean).join(', ') || null;
      screenings.push({ title: title.substring(0, 35), year, date, time, venue: 'Regent Street Cinema', bookingUrl: (BOOKING_BASE + s.id).substring(0, 70), format });
    }
  });

  console.log(`Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── Rich Mix ────────────────────────────────────────────────────────────────
async function testRichMix() {
  const LISTING_URL = 'https://richmix.org.uk/whats-on/cinema/';
  const BASE_URL = 'https://richmix.org.uk';
  const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

  function parseWeekdayDate(text) {
    const t = text.trim();
    if (/today/i.test(t)) return new Date().toISOString().split('T')[0];
    if (/tomorrow/i.test(t)) { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; }
    const match = t.match(/(\d{1,2})\s+([A-Za-z]{3})/);
    if (match) {
      const day = parseInt(match[1], 10), month = MONTHS[match[2]];
      if (month !== undefined) {
        const today = new Date();
        let year = today.getFullYear();
        if (month < today.getMonth() || (month === today.getMonth() && day < today.getDate()-7)) year++;
        return new Date(year, month, day).toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  function parseTime(text) {
    const match = text.trim().match(/(\d{1,2})\.(\d{2})\s*(am|pm)/i);
    if (!match) return text.trim();
    let h = parseInt(match[1], 10);
    const m = match[2], p = match[3].toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return `${h.toString().padStart(2,'0')}:${m}`;
  }

  const listHtml = await fetch(LISTING_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
  const $ = cheerio.load(listHtml);
  const films = [];
  $('div.tease.tease-cinema').each((_, el) => {
    const titleEl = $(el).find('header h3 a').first();
    const rawTitle = titleEl.text().trim();
    if (!rawTitle) return;
    const filmUrl = titleEl.attr('href') || $(el).find('div.post-image a').attr('href') || '';
    if (!filmUrl) return;
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;
    films.push({ url: filmUrl, title, year });
  });

  console.log(`\n===== RICH MIX =====`);
  console.log(`Films on listing page: ${films.length}`);

  const results = await Promise.allSettled(films.map(async f => {
    const html = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text());
    const $f = cheerio.load(html);
    const screenings = [];
    $f('#dates-and-times div.day').each((_, dayEl) => {
      const dateText = $f(dayEl).find('div.weekday').first().text();
      if (!dateText.trim()) return;
      const date = parseWeekdayDate(dateText);
      $f(dayEl).find('div.times a.time').each((_, timeEl) => {
        const timeText = $f(timeEl).text().trim();
        if (!timeText) return;
        const time = parseTime(timeText);
        const href = $f(timeEl).attr('href') || '';
        screenings.push({ title: f.title.substring(0,35), year: f.year, date, time, venue: 'Rich Mix', bookingUrl: href ? (BASE_URL+href).substring(0,70) : null, format: null });
      });
    });
    return screenings;
  }));

  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  console.log(`Total screenings: ${all.length}`);
  all.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── JW3 ─────────────────────────────────────────────────────────────────────
async function testJW3() {
  const EVENTS_URL = 'https://system.spektrix.com/jw3/api/v3/events';
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
  const todayStr = new Date().toISOString().split('T')[0];

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const events = await fetch(EVENTS_URL, { headers }).then(r => r.json());
  const cinemaEvents = events.filter(e => e.attribute_Genre === 'Cinema');

  console.log(`\n===== JW3 =====`);
  console.log(`Total Spektrix events: ${events.length}, Cinema: ${cinemaEvents.length}`);

  const results = await Promise.allSettled(cinemaEvents.map(async event => {
    const instances = await fetch(`${EVENTS_URL}/${event.id}/instances`, { headers }).then(r => r.json());
    const series = event.attribute_SeriesOrFestival?.trim() ?? '';
    let rawTitle = event.name.trim();
    if (series && rawTitle.toLowerCase().startsWith(series.toLowerCase() + ':')) rawTitle = rawTitle.substring(series.length + 1).trim();
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;
    const bookingUrl = `https://www.jw3.org.uk/whats-on/${slugify(event.name)}`;
    const screenings = [];
    for (const inst of instances) {
      if (inst.cancelled) continue;
      const dateStr = inst.start.split('T')[0];
      if (dateStr < todayStr) continue;
      const time = inst.start.substring(11, 16);
      const formatParts = [];
      if (series) formatParts.push(series);
      if (inst.attribute_SLCaptioned) formatParts.push('Captioned');
      if (event.attribute_Language && event.attribute_Language !== 'English') formatParts.push(event.attribute_Language);
      const format = formatParts.length > 0 ? formatParts.join(', ') : null;
      screenings.push({ title: title.substring(0,35), year, date: dateStr, time, venue: 'JW3', bookingUrl: bookingUrl.substring(0,70), format });
    }
    return screenings;
  }));

  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  console.log(`Total screenings: ${all.length}`);
  all.slice(0, 5).forEach(s => console.log(' ', s));
}

await testRegentStreet();
await testRichMix();
await testJW3();
