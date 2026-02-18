import * as cheerio from 'cheerio';

const sites = [
  { name: 'Phoenix', url: 'https://phoenixcinema.co.uk/whats-on/' },
  { name: 'Lexi',    url: 'https://thelexicinema.co.uk/whats-on/' },
  { name: 'Garden',  url: 'https://gardencinema.co.uk/whats-on/' },
];

for (const site of sites) {
  console.log('\n' + '='.repeat(70));
  console.log(site.name.toUpperCase(), '—', site.url);
  console.log('='.repeat(70));
  try {
    const res = await fetch(site.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    console.log('Status:', res.status, '  Length:', html.length);

    const $ = cheerio.load(html);

    // Print first 3000 chars
    console.log('\n--- FIRST 3000 CHARS ---');
    console.log(html.substring(0, 3000));

    // Find date-like elements
    const datePattern = /\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|20\d{2}-\d{2}-\d{2})/i;
    console.log('\n--- DATE CANDIDATE ELEMENTS ---');
    $('*').each((i, el) => {
      const text = $(el).clone().children().remove().end().text().trim();
      if (datePattern.test(text) && text.length < 60 && $(el).children().length === 0) {
        const cls = $(el).attr('class') || '';
        const id = $(el).attr('id') || '';
        console.log(`  <${el.name} class="${cls}" id="${id}">${text}`);
      }
    });

    // Find likely film/event containers
    console.log('\n--- REPEATING FILM CONTAINERS ---');
    const selectors = ['article', '[class*="film"]', '[class*="event"]', '[class*="listing"]',
                       '[class*="card"]', '[class*="show"]', '[class*="screening"]',
                       '[class*="programme"]', '[class*="item"]', '[class*="perf"]'];
    for (const sel of selectors) {
      const els = $(sel);
      if (els.length > 1) {
        console.log(`  ${sel}: ${els.length} elements`);
        const first = $.html(els.first()).substring(0, 300);
        console.log('  First:', first, '\n');
      }
    }

    // Find booking/ticket links
    console.log('\n--- BOOKING LINKS ---');
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim().substring(0, 40);
      if (/book|ticket|reserve|buy|seat/i.test(href + text)) {
        if (i < 10) console.log(`  "${text}" → ${href.substring(0, 100)}`);
      }
    });

    // Find script tags that might contain JSON data
    console.log('\n--- DATA SCRIPTS ---');
    $('script').each((i, el) => {
      const content = $(el).text();
      if ((content.includes('film') || content.includes('show') || content.includes('event')) && content.length > 200 && content.length < 5000) {
        console.log(`  Script ${i} (${content.length} chars):`, content.substring(0, 500));
      }
    });

  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
