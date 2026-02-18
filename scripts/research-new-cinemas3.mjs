import * as cheerio from 'cheerio';

// ── Phoenix: try the Savoy DLL WhatsOn directly ───────────────────────────────
async function researchPhoenix() {
  console.log('\n===== PHOENIX - SAVOY DLL WHATS-ON =====');
  const url = 'https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Status:', res.status, 'Length:', html.length);

  // Look for date sections, film containers, time slots
  console.log('\n--- DATE ELEMENTS ---');
  $('[class*="date"], [class*="day"], [class*="session"]').each((i, el) => {
    if (i < 5) {
      const text = $(el).text().trim().substring(0, 80);
      console.log(`  <${el.name} class="${$(el).attr('class')}">${text}`);
    }
  });

  // Find h2/h3/h4 with date-like text
  $('h2, h3, h4, h5').each((i, el) => {
    const text = $(el).text().trim();
    if (/\b(mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(text) && text.length < 60) {
      console.log(`  DATE HEADER: <${el.name} class="${$(el).attr('class')}">${text}`);
    }
  });

  // First 3000 chars
  console.log('\n--- FIRST 3000 CHARS ---');
  console.log(html.substring(0, 3000));

  // Look at film detail page
  console.log('\n===== PHOENIX - FILM DETAIL PAGE =====');
  const detailUrl = 'https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=336977';
  const res2 = await fetch(detailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  console.log('Status:', res2.status, 'Length:', html2.length);
  // Find time/performance slots
  console.log('\n--- DATE + TIME SECTIONS ---');
  $2('[class*="date"], [class*="session"], [class*="perf"], [class*="time"]').each((i, el) => {
    if (i < 10) {
      const text = $2(el).text().trim().substring(0, 100);
      console.log(`  <${el.name} class="${$2(el).attr('class')}">${text}`);
    }
  });
  console.log('\n--- FIRST 3000 CHARS OF FILM DETAIL ---');
  console.log(html2.substring(0, 3000));
}

// ── Lexi: understand structure ────────────────────────────────────────────────
async function researchLexi() {
  console.log('\n===== LEXI CINEMA - HOMEPAGE STRUCTURE =====');
  const res = await fetch('https://thelexicinema.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Status:', res.status, 'Length:', html.length);

  // Find programme/film items (same Savoy Systems platform as Phoenix based on HTML header)
  console.log('\n--- PROGRAMME ITEMS ---');
  $('[class*="programme"]').each((i, el) => {
    if (i < 3) {
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim().substring(0, 100);
      console.log(`  <${el.name} class="${cls}">${text}`);
    }
  });

  // First film card
  console.log('\n--- FIRST FILM CARD ---');
  const firstProg = $('[class*="programme"]').first();
  console.log($.html(firstProg).substring(0, 1500));

  // Look for DLL WhatsOn link
  console.log('\n--- WHATSON/BOOKING LINKS ---');
  $('a[href*="WhatsOn"], a[href*="dll"]').each((i, el) => {
    if (i < 5) console.log(`  "${$(el).text().trim().substring(0, 30)}" → ${$(el).attr('href')?.substring(0, 100)}`);
  });

  // First 2000 chars
  console.log('\n--- FIRST 2000 CHARS ---');
  console.log(html.substring(0, 2000));
}

// ── Garden: understand structure ──────────────────────────────────────────────
async function researchGarden() {
  console.log('\n===== GARDEN CINEMA - HOMEPAGE =====');
  const res = await fetch('https://thegardencinema.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Status:', res.status, 'Length:', html.length);

  // First 3000 chars
  console.log('\n--- FIRST 3000 CHARS ---');
  console.log(html.substring(0, 3000));

  // Find film/event containers
  console.log('\n--- REPEATING CONTAINERS ---');
  const selectors = ['article', '[class*="film"]', '[class*="event"]', '[class*="movie"]',
                     '[class*="show"]', '[class*="screening"]', '[class*="listing"]', '[class*="card"]'];
  for (const sel of selectors) {
    const els = $(sel);
    if (els.length > 1) {
      console.log(`  ${sel}: ${els.length} elements`);
      console.log('  First:', $.html(els.first()).substring(0, 300), '\n');
    }
  }

  // Try /whats-on/ with www
  console.log('\n===== GARDEN - WHATS-ON PAGE =====');
  const res2 = await fetch('https://thegardencinema.co.uk/whats-on/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  console.log('Status:', res2.status, 'Length:', html2.length);
  console.log('\n--- FIRST 2000 CHARS ---');
  console.log(html2.substring(0, 2000));

  // Date and film elements
  const datePattern = /\b(mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
  console.log('\n--- DATE ELEMENTS ---');
  $2('*').each((i, el) => {
    const text = $2(el).clone().children().remove().end().text().trim();
    if (datePattern.test(text) && text.length < 80 && $2(el).children().length === 0) {
      console.log(`  <${el.name} class="${$2(el).attr('class')}">${text}`);
    }
  });
}

await researchPhoenix();
await researchLexi();
await researchGarden();
