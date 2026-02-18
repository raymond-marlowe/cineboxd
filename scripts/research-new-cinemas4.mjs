import * as cheerio from 'cheerio';

// ── Phoenix: check if DLL WhatsOn has full schedule + parse film detail ───────
async function researchPhoenix() {
  console.log('\n===== PHOENIX - DLL WHATSON FULL SCHEDULE CHECK =====');
  const res = await fetch('https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  // Check if performances exist on this page
  console.log('ul.performances count:', $('ul.performances').length);
  console.log('span.perf-time count:', $('span.perf-time').length);
  console.log('li.performance count:', $('li.performance').length);
  console.log('h3.film-title count:', $('h3.film-title').length);

  // Find all film links with f= parameter
  const filmLinks = new Set();
  $('a[href*="?f="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]f=(\d+)/);
    if (m) filmLinks.add(href);
  });
  console.log('Unique film ?f= links:', filmLinks.size);
  [...filmLinks].slice(0, 5).forEach(l => console.log(' ', l.substring(0, 100)));

  // Check if schedule is on a different URL
  console.log('\n--- PERFORMANCE/SCHEDULE SELECTORS ---');
  $('li.performance, .schedule, .showtimes, .listing').each((i, el) => {
    if (i < 3) console.log(`  <${el.name} class="${$(el).attr('class')}">${$(el).text().trim().substring(0, 80)}`);
  });

  // Now fetch the film detail page to understand performance structure
  console.log('\n===== PHOENIX - FILM DETAIL STRUCTURE =====');
  const detailUrl = 'https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=336977';
  const res2 = await fetch(detailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);

  // Get title
  const title = $2('h1, h2, h3').filter((_, el) => $2(el).text().trim().length > 3 && $2(el).text().trim().length < 100).first().text().trim();
  console.log('Title:', title);

  // Get first few performances
  $2('li.performance').each((i, el) => {
    if (i < 5) {
      const dateText = $2(el).find('span.date').text().trim();
      const timeText = $2(el).find('span.perf-time').text().trim();
      const bookLink = $2(el).find('a[href*="Booking"]').attr('href') || $2(el).find('a[href*="dll"]').attr('href') || '';
      console.log(`  Perf ${i}: date="${dateText}" time="${timeText}" href="${bookLink.substring(0, 100)}"`);
    }
  });

  // Print a section of the HTML around performance elements
  const lines = html2.split('\n');
  const perfLineIdx = lines.findIndex(l => l.includes('li class="performance'));
  if (perfLineIdx > 0) {
    console.log('\n--- HTML AROUND FIRST PERFORMANCE ---');
    lines.slice(perfLineIdx - 2, perfLineIdx + 20).forEach((l, i) => {
      if (l.trim()) console.log(`${perfLineIdx-2+i}: ${l.substring(0, 200)}`);
    });
  }

  // Check for format/tags
  $2('[class*="tag"], [class*="format"], [class*="label"]').each((i, el) => {
    if (i < 5) console.log(`  Format tag: <${el.name} class="${$2(el).attr('class')}">${$2(el).text().trim()}`);
  });
}

// ── Lexi: try the DLL WhatsOn directly ───────────────────────────────────────
async function researchLexi() {
  console.log('\n===== LEXI - DLL WHATSON =====');
  const res = await fetch('https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Status:', res.status, 'Length:', html.length);
  console.log('h3.film-title count:', $('h3.film-title').length);
  console.log('li.performance count:', $('li.performance').length);

  // Print first film item
  const firstItem = $('[class*="programme"]').first();
  console.log('First programme item:', $.html(firstItem).substring(0, 800));

  // Film links
  const filmLinks = new Set();
  $('a[href*="?f="]').each((_, el) => { filmLinks.add($(el).attr('href')); });
  console.log('Film f= links:', filmLinks.size, [...filmLinks].slice(0, 5));

  // Check film detail
  if (filmLinks.size > 0) {
    const firstLink = [...filmLinks][0];
    const fullUrl = firstLink.startsWith('http') ? firstLink : `https://thelexicinema.co.uk/${firstLink}`;
    console.log('\n--- LEXI FILM DETAIL:', fullUrl, '---');
    const res2 = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html2 = await res2.text();
    const $2 = cheerio.load(html2);
    console.log('Status:', res2.status, 'Performances:', $2('li.performance').length);
    $2('li.performance').each((i, el) => {
      if (i < 3) {
        const dateText = $2(el).find('span.date').text().trim();
        const timeText = $2(el).find('span.perf-time').text().trim();
        const href = $2(el).find('a').attr('href') || '';
        console.log(`  Perf ${i}: date="${dateText}" time="${timeText}" href="${href.substring(0, 100)}"`);
      }
    });
  }
}

// ── Garden: deep structure dive ───────────────────────────────────────────────
async function researchGarden() {
  console.log('\n===== GARDEN CINEMA - DEEP STRUCTURE =====');
  const res = await fetch('https://thegardencinema.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find the by-date section
  const byDateSection = $('section.films-list__by-date, .films-list__by-date').first();
  console.log('By-date section found:', byDateSection.length > 0);

  // Get date blocks
  const dateBlocks = $('.date-block[data-date]');
  console.log('Date blocks:', dateBlocks.length);
  dateBlocks.each((i, el) => {
    const date = $(el).attr('data-date');
    const films = $(el).find('[class*="film"]').length;
    const screenings = $(el).find('.screening-panel, a.screening').length;
    console.log(`  Date ${date}: ${films} film elements, ${screenings} screenings`);
    if (i > 5) return false; // stop after 6
  });

  // Print first date block in detail
  console.log('\n--- FIRST DATE BLOCK HTML ---');
  console.log($.html(dateBlocks.first()).substring(0, 2000));

  // Check screening panel structure
  console.log('\n--- FIRST SCREENING PANEL ---');
  const firstPanel = $('.screening-panel').first();
  console.log($.html(firstPanel).substring(0, 600));

  // Check film title selectors
  console.log('\n--- FILM TITLE ELEMENTS ---');
  $('[class*="film__title"], [class*="film-title"], .film__name, h2[class*="film"], h3[class*="film"]').each((i, el) => {
    if (i < 5) console.log(`  <${el.name} class="${$(el).attr('class')}">${$(el).text().trim().substring(0, 60)}`);
  });
}

await researchPhoenix();
await researchLexi();
await researchGarden();
