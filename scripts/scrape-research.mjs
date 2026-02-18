// Research script: extract exact date/time structure from Genesis, Arthouse, ActOne
import * as cheerio from 'cheerio';

// ── Genesis Cinema ──────────────────────────────────────────────────────────
async function researchGenesis() {
  console.log('\n===== GENESIS CINEMA =====');
  const res = await fetch('https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn');
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('HTML length:', html.length);

  // Look for date section headers - search all elements that contain a date-like text
  const datePattern = /\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
  $('*').each((i, el) => {
    const text = $(el).text().trim();
    if (datePattern.test(text) && text.length < 50 && $(el).children().length === 0) {
      const tag = el.type === 'tag' ? el.name : 'text';
      const cls = $(el).attr('class') || '';
      const id = $(el).attr('id') || '';
      console.log(`DATE CANDIDATE: <${tag} class="${cls}" id="${id}">${text}</${tag}>`);
    }
  });

  // Find h2 titles and nearby perf buttons
  console.log('\n--- FILM + PERF STRUCTURE ---');
  $('h2.text-black').each((i, el) => {
    const title = $(el).find('a').text().trim();
    const href = $(el).find('a').attr('href') || '';
    console.log(`Film: "${title}" href="${href}"`);

    // Find the parent container that contains this h2 and the perf buttons
    const parent = $(el).closest('[class*="grid"], [class*="flex"], [class*="card"], div').first();
    parent.find('.perfButton').each((j, btn) => {
      const time = $(btn).text().trim().substring(0, 20);
      const bookHref = $(btn).attr('href') || '';
      const isSoldOut = $(btn).hasClass('soldOutPerformance');
      // Find format icons next to this button
      const icons = $(btn).siblings('img').map((_, img) => $(img).attr('alt') || '').get();
      console.log(`  Perf: time="${time}" sold=${isSoldOut} href="${bookHref.substring(0,60)}" icons=${JSON.stringify(icons)}`);
    });
  });

  // Look for what wraps a date + its films
  console.log('\n--- SEARCHING FOR DATE SECTIONS ---');
  // Try finding sections or divs that contain both a date text and h2 elements
  $('section, [class*="date"], [class*="day"], [class*="schedule"]').each((i, el) => {
    const cls = $(el).attr('class') || el.name;
    const text = $(el).text().trim().substring(0, 100);
    if (text) console.log(`SECTION <${el.name} class="${cls}">`);
  });
}

// ── Arthouse Crouch End ─────────────────────────────────────────────────────
async function researchArthouse() {
  console.log('\n===== ARTHOUSE CROUCH END =====');
  const res = await fetch('https://www.arthousecrouchend.co.uk/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('HTML length:', html.length);

  // Find film-item divs
  console.log('\n--- FILM ITEMS ---');
  $('.film-item').each((i, el) => {
    const titleEl = $(el).find('a[href*="programme"] h3, a[href*="programme"]').first();
    const title = titleEl.text().trim();
    const titleHref = titleEl.closest('a').attr('href') || titleEl.attr('href') || '';
    const times = $(el).find('a[title="Click to Book"]').map((_, a) => ({
      time: $(a).text().trim().substring(0, 30),
      href: $(a).attr('href') || ''
    })).get();
    console.log(`Film ${i}: "${title}" href="${titleHref}"`);
    times.forEach(t => console.log(`  Time: "${t.time}" href="${t.href.substring(0, 80)}"`));
  });

  // Find date headers - look at what's between film-item divs
  console.log('\n--- DATE LABELS (elements between film-items) ---');
  const datePattern = /\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
  $('body *').each((i, el) => {
    const text = $(el).clone().children().remove().end().text().trim();
    if (datePattern.test(text) && text.length < 40 && $(el).children().length <= 1) {
      const tag = el.name;
      const cls = $(el).attr('class') || '';
      console.log(`DATE: <${tag} class="${cls}">${text}</${tag}>`);
    }
  });

  // Print the raw HTML around the first film-item to understand surrounding structure
  console.log('\n--- RAW HTML AROUND FIRST FILM ITEM ---');
  const firstFilm = $('.film-item').first();
  if (firstFilm.length) {
    const parent = firstFilm.parent();
    console.log('Parent tag:', parent[0]?.name, 'class:', parent.attr('class'));
    // Get all siblings
    parent.children().each((i, sib) => {
      const sibHtml = $.html(sib).substring(0, 200);
      console.log(`  Child ${i}: ${sibHtml}`);
    });
  }
}

// ── ActOne Cinema ────────────────────────────────────────────────────────────
async function researchActOne() {
  console.log('\n===== ACTONE CINEMA =====');
  const res = await fetch('https://www.actonecinema.co.uk/whats-on/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('HTML length:', html.length, 'Status:', res.status);
  console.log('First 2000 chars:');
  console.log(html.substring(0, 2000));

  // Check for any embedded JSON
  const jsonMatches = html.match(/\{[^{}]{200,}\}/g) || [];
  if (jsonMatches.length) {
    console.log('\nPossible JSON blobs:', jsonMatches.length);
    jsonMatches.slice(0, 2).forEach(m => console.log(m.substring(0, 500)));
  }

  // Check for script tags with data
  $('script').each((i, el) => {
    const content = $(el).text();
    if (content.includes('show') || content.includes('film') || content.includes('screening') || content.includes('event')) {
      console.log(`Script ${i} (${content.length} chars):`, content.substring(0, 300));
    }
  });

  // Find any repeating containers
  const containers = ['[class*="show"]', '[class*="film"]', '[class*="event"]', '[class*="screening"]',
                      '[class*="card"]', '[class*="listing"]', 'article', '.item'];
  for (const sel of containers) {
    const els = $(sel);
    if (els.length > 1) {
      console.log(`\nFound ${els.length} "${sel}" elements`);
      console.log('First:', $.html(els.first()).substring(0, 300));
    }
  }
}

await researchGenesis();
await researchArthouse();
await researchActOne();
