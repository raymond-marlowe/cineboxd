import * as cheerio from 'cheerio';

// ── Phoenix ────────────────────────────────────────────────────────────────────
async function testPhoenix() {
  const CMS_URL = 'https://phoenixcinema.co.uk/whats-on/';
  const DLL_BASE = 'https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/';
  const MONTH_MAP = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

  function parseDate(text) {
    const today = new Date();
    const match = text.trim().match(/(\d{1,2})\s+([A-Za-z]{3})/);
    if (!match) return today.toISOString().split('T')[0];
    const day = parseInt(match[1], 10);
    const month = MONTH_MAP[match[2]];
    if (month === undefined) return today.toISOString().split('T')[0];
    let year = today.getFullYear();
    if (month < today.getMonth()) year++;
    return new Date(year, month, day).toISOString().split('T')[0];
  }

  const cmsRes = await fetch(CMS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const cmsHtml = await cmsRes.text();
  const $cms = cheerio.load(cmsHtml);
  const filmIds = new Set();
  $cms('a[href*="?f="]').each((_, el) => {
    const m = ($cms(el).attr('href') || '').match(/[?&]f=(\d+)/);
    if (m) filmIds.add(m[1]);
  });

  const results = await Promise.allSettled([...filmIds].map(async id => {
    const res = await fetch(`${DLL_BASE}WhatsOn?f=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);
    const rawTitle = $('title').text().replace(/^Phoenix Cinema\s*\|\s*/i, '').trim();
    const screenings = [];
    const seen = new Set();
    $('li.performance').each((_, li) => {
      const date = parseDate($(li).find('span.date').text().trim());
      const time = $(li).find('span.perf-time').text().trim();
      const rel = $(li).find('a.booking').attr('href') || '';
      if (!time) return;
      const bookingUrl = rel ? DLL_BASE + rel : null;
      if (bookingUrl && seen.has(bookingUrl)) return;
      if (bookingUrl) seen.add(bookingUrl);
      screenings.push({ title: rawTitle.substring(0, 30), date, time, bookingUrl: bookingUrl?.substring(0, 60) });
    });
    return screenings;
  }));

  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  console.log('\n===== PHOENIX CINEMA =====');
  console.log(`Film IDs: ${filmIds.size}, Total screenings: ${all.length}`);
  all.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── Lexi ───────────────────────────────────────────────────────────────────────
async function testLexi() {
  const WHATS_ON_URL = 'https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn';
  const DLL_BASE = 'https://thelexicinema.co.uk/TheLexiCinema.dll/';
  const res = await fetch(WHATS_ON_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const lines = html.split('\n');
  const idx = lines.findIndex(l => l.trim().startsWith('var Events ='));
  if (idx === -1) { console.log('LEXI: var Events not found'); return; }
  const data = JSON.parse(lines[idx + 1]);
  const screenings = [];
  for (const ev of data.Events) {
    const title = ev.Title?.trim() || '';
    if (!title) continue;
    const year = ev.Year ? parseInt(ev.Year, 10) : null;
    for (const perf of ev.Performances ?? []) {
      if (!perf.StartDate || !perf.StartTimeAndNotes) continue;
      const bookingUrl = perf.URL ? DLL_BASE + perf.URL : null;
      screenings.push({ title: title.substring(0, 30), year, date: perf.StartDate, time: perf.StartTimeAndNotes, bookingUrl: bookingUrl?.substring(0, 60) });
    }
  }
  console.log('\n===== THE LEXI CINEMA =====');
  console.log(`Events: ${data.Events.length}, Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── Garden ─────────────────────────────────────────────────────────────────────
async function testGarden() {
  const res = await fetch('https://thegardencinema.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings = [];
  $('.date-block[data-date]').each((_, dateBlock) => {
    const date = $(dateBlock).attr('data-date');
    if (!date) return;
    $(dateBlock).find('.films-list__by-date__film').each((_, filmEl) => {
      const rawTitle = $(filmEl).find('h1.films-list__by-date__film__title').first().clone().find('span').remove().end().text().trim();
      if (!rawTitle) return;
      const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
      const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;
      $(filmEl).find('.screening-panel').each((_, panel) => {
        const anchor = $(panel).find('span.screening-time > a.screening').first();
        const time = anchor.text().trim();
        const bookingUrl = anchor.attr('href') || null;
        if (!time) return;
        screenings.push({ title: title.substring(0, 30), date, time, bookingUrl: bookingUrl?.substring(0, 60) });
      });
    });
  });
  console.log('\n===== GARDEN CINEMA =====');
  console.log(`Date blocks: ${$('.date-block[data-date]').length}, Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

await testPhoenix();
await testLexi();
await testGarden();
