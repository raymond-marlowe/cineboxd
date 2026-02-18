import * as cheerio from 'cheerio';

// ── Phoenix: deeper dive ──────────────────────────────────────────────────────
async function researchPhoenix() {
  console.log('\n===== PHOENIX CINEMA - DEEPER =====');
  const res = await fetch('https://phoenixcinema.co.uk/whats-on/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find the whats-on listing section - look for film schedule items
  console.log('\n--- SCHEDULE ITEMS ---');
  $('.schedule-item, .whats-on-item, .film-item, .whatson-item').each((i, el) => {
    if (i < 3) console.log(`item ${i}:`, $.html(el).substring(0, 400));
  });

  // Look at programme items
  console.log('\n--- PROGRAMME ITEMS ---');
  $('[class*="programme"]').each((i, el) => {
    const cls = $(el).attr('class') || '';
    const text = $(el).text().trim().substring(0, 100);
    if (i < 5) console.log(`prog ${i}: <${el.name} class="${cls}"> ${text}`);
  });

  // Find the first film card structure
  console.log('\n--- FIRST FILM CARD FULL HTML ---');
  const firstCard = $('[class*="programme"]').first();
  if (firstCard.length) {
    console.log($.html(firstCard).substring(0, 1500));
  }

  // Find time elements
  console.log('\n--- TIME ELEMENTS ---');
  $('[class*="time"], [class*="session"], [class*="perf"]').each((i, el) => {
    if (i < 5) {
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim().substring(0, 50);
      console.log(`time ${i}: <${el.name} class="${cls}"> ${text}`);
    }
  });

  // Print HTML lines 200-400 (past nav)
  const lines = html.split('\n');
  console.log('\n--- HTML LINES 200-400 ---');
  lines.slice(200, 400).forEach((line, i) => {
    if (line.trim() && line.trim().length > 10) console.log(`${200+i}: ${line.substring(0, 200)}`);
  });
}

// ── Lexi: try different URLs ──────────────────────────────────────────────────
async function researchLexi() {
  console.log('\n===== LEXI CINEMA - URL DISCOVERY =====');
  const candidates = [
    'https://thelexicinema.co.uk/',
    'https://thelexicinema.co.uk/films/',
    'https://thelexicinema.co.uk/whatson/',
    'https://thelexicinema.co.uk/cinema/',
    'https://www.thelexicinema.co.uk/',
    'https://www.thelexicinema.co.uk/whats-on/',
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      console.log(`${url} → ${res.status}, ${html.length} bytes`);
      if (res.status === 200 && html.length > 5000) {
        console.log('  First 500 chars:', html.substring(0, 500));
        break;
      }
    } catch (e) {
      console.log(`${url} → ERROR: ${e.message}`);
    }
  }
}

// ── Garden: try different URLs ────────────────────────────────────────────────
async function researchGarden() {
  console.log('\n===== GARDEN CINEMA - URL DISCOVERY =====');
  const candidates = [
    'https://www.gardencinema.co.uk/',
    'https://www.gardencinema.co.uk/whats-on/',
    'https://gardencinema.co.uk/',
    'https://thegardencinema.co.uk/',
    'https://thegardencinema.co.uk/whats-on/',
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      console.log(`${url} → ${res.status}, ${html.length} bytes`);
      if (res.status === 200 && html.length > 5000) {
        console.log('  First 500 chars:', html.substring(0, 500));
        break;
      }
    } catch (e) {
      console.log(`${url} → ERROR: ${e.message}`);
    }
  }
}

await researchPhoenix();
await researchLexi();
await researchGarden();
