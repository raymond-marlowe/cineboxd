import * as cheerio from 'cheerio';

// ── Phoenix: verify the CMS page film IDs and parallel scraping approach ───────
async function researchPhoenix() {
  console.log('\n===== PHOENIX - CMS PAGE FILM IDs =====');
  const res = await fetch('https://phoenixcinema.co.uk/whats-on/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  // Find all unique film page links
  const filmIds = new Set();
  $('a[href*="?f="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]f=(\d+)/);
    if (m) filmIds.add(m[1]);
  });
  console.log('Film IDs on CMS page:', [...filmIds]);

  // Also look for any links containing WhatsOn?f=
  console.log('\nAll WhatsOn links:');
  $('a[href*="WhatsOn"]').each((i, el) => {
    if (i < 10) console.log(`  "${$(el).text().trim().substring(0, 30)}" → ${$(el).attr('href')?.substring(0, 100)}`);
  });
}

// ── Lexi: inspect the DLL page structure carefully ────────────────────────────
async function researchLexi() {
  console.log('\n===== LEXI - DLL PAGE STRUCTURE =====');
  const res = await fetch('https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Length:', html.length);

  // Check what's around h3.film-title
  console.log('\n--- FIRST FEW h3.film-title elements and their context ---');
  $('h3.film-title').each((i, el) => {
    if (i < 3) {
      const parent = $(el).parent();
      const gp = parent.parent();
      console.log(`Film ${i}: "${$(el).text().trim()}"`);
      console.log(`  parent: <${parent[0]?.name} class="${parent.attr('class')}">`);
      console.log(`  gp: <${gp[0]?.name} class="${gp.attr('class')}">`);
      // Look for performances nearby
      const nearbyPerfs = $(el).closest('[class*="film"], [class*="programme"], div').find('li.performance, [class*="time"], [class*="perf"]');
      if (nearbyPerfs.length > 0) console.log(`  nearby perf elements: ${nearbyPerfs.length}`);
    }
  });

  // Look for ALL links with dll in them
  console.log('\n--- ALL DLL LINKS ---');
  $('a[href*="dll"]').each((i, el) => {
    if (i < 10) console.log(`  "${$(el).text().trim().substring(0, 30)}" → ${$(el).attr('href')?.substring(0, 120)}`);
  });

  // Find the film id pattern in links
  console.log('\n--- LINKS WITH f= OR FILM ID ---');
  $('a[href*="="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (/[?&]f=\d+|Film=\d+|film=\d+/.test(href)) {
      console.log(`  "${$(el).text().trim().substring(0, 30)}" → ${href.substring(0, 120)}`);
    }
  });

  // Print HTML lines around "film-title" class occurrences
  const lines = html.split('\n');
  const filmTitleIdx = lines.findIndex(l => l.includes('film-title'));
  if (filmTitleIdx > 0) {
    console.log(`\n--- HTML AROUND FIRST film-title (line ${filmTitleIdx}) ---`);
    lines.slice(filmTitleIdx - 5, filmTitleIdx + 30).forEach((l, i) => {
      if (l.trim()) console.log(`${filmTitleIdx-5+i}: ${l.substring(0, 200)}`);
    });
  }
}

// ── Garden: detailed film title and screening structure ───────────────────────
async function researchGarden() {
  console.log('\n===== GARDEN - DETAILED SCRAPING TEST =====');
  const res = await fetch('https://thegardencinema.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];
  // Iterate date blocks
  $('.date-block[data-date]').each((_, dateBlock) => {
    const date = $(dateBlock).attr('data-date'); // "2026-02-19"
    if (!date) return;

    $(dateBlock).find('.films-list__by-date__film').each((_, filmEl) => {
      const titleEl = $(filmEl).find('h1.films-list__by-date__film__title').first();
      // Strip the rating span
      const rawTitle = titleEl.clone().find('span').remove().end().text().trim();
      if (!rawTitle) return;

      const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;

      $(filmEl).find('.screening-panel').each((_, panel) => {
        const timeAnchor = $(panel).find('span.screening-time > a.screening').first();
        const time = timeAnchor.text().trim();
        const bookingUrl = timeAnchor.attr('href') || null;

        // Format tags
        const formatTags = $(panel).find('[class*="screening-tag"]').map((_, t) => {
          return $(t).attr('class')?.replace(/screening-tag\s*/, '').replace(/ext-/, '').trim() || '';
        }).get().filter(Boolean);
        const format = formatTags.length > 0 ? formatTags.join(', ') : null;

        results.push({ title: title.substring(0, 35), date, time, bookingUrl: bookingUrl?.substring(0, 80), format });
      });
    });
  });

  console.log('Total Garden screenings:', results.length);
  results.slice(0, 8).forEach(r => console.log(' ', r));
}

await researchPhoenix();
await researchLexi();
await researchGarden();
