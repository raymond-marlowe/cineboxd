import * as cheerio from 'cheerio';

// ── Genesis: Find the date-section structure ────────────────────────────────
async function researchGenesis() {
  console.log('\n===== GENESIS CINEMA - DATE SECTION STRUCTURE =====');
  const res = await fetch('https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn');
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find elements with data-date attribute
  $('[data-date]').each((i, el) => {
    console.log(`data-date element: <${el.name} class="${$(el).attr('class')}" data-date="${$(el).attr('data-date')}">`);
  });

  // Find the tab panel/content areas
  $('[class*="tabContent"], [class*="tab-content"], [class*="daySection"], [class*="schedule"], [role="tabpanel"], [id*="tab"], [id*="day"]').each((i, el) => {
    const cls = $(el).attr('class') || '';
    const id = $(el).attr('id') || '';
    const h2s = $(el).find('h2').length;
    console.log(`Tab panel: <${el.name} class="${cls}" id="${id}"> contains ${h2s} h2s`);
  });

  // Find parent containers of the h2.text-black elements to understand the date grouping
  // Look for what immediately contains ALL h2.text-black
  const h2Parents = new Map();
  $('h2.text-black').each((i, el) => {
    let parent = $(el).parent();
    for (let depth = 0; depth < 5; depth++) {
      const tag = parent[0]?.name;
      const cls = parent.attr('class') || '';
      const key = `${tag}|${cls}`;
      if (!h2Parents.has(key)) h2Parents.set(key, 0);
      h2Parents.set(key, h2Parents.get(key) + 1);
      parent = parent.parent();
    }
  });
  console.log('\nParent chain of h2.text-black elements:');
  h2Parents.forEach((count, key) => {
    if (count > 1) console.log(`  ${key} (appears ${count} times)`);
  });

  // Print a 200-line chunk of HTML around line 970 (where date_top_half was found)
  const lines = html.split('\n');
  console.log('\n--- HTML LINES 960-1090 ---');
  lines.slice(960, 1090).forEach((line, i) => {
    if (line.trim()) console.log(`${960+i}: ${line.substring(0, 200)}`);
  });

  // Find perfButton elements and their CLOSEST ancestor that also contains an h2
  console.log('\n--- FIRST PERFBUTTON and ancestors ---');
  const firstPerf = $('.perfButton').first();
  if (firstPerf.length) {
    console.log('perfButton text:', firstPerf.text().trim());
    console.log('perfButton href:', firstPerf.attr('href'));
    let ancestor = firstPerf.parent();
    for (let d = 0; d < 8; d++) {
      const tag = ancestor[0]?.name;
      const cls = ancestor.attr('class') || '';
      const h2count = ancestor.find('h2').length;
      console.log(`  ancestor ${d}: <${tag} class="${cls.substring(0,60)}"> h2s=${h2count}`);
      ancestor = ancestor.parent();
    }
  }

  // Check if there's a data-perf-date or similar attribute on perfButton
  $('.perfButton').each((i, el) => {
    const attrs = el.attribs;
    const attrStr = Object.entries(attrs).map(([k,v]) => `${k}="${v.substring(0,50)}"`).join(' ');
    if (i < 3) console.log(`perfButton attrs: ${attrStr}`);
  });
}

// ── Arthouse: Find actual film container class ───────────────────────────────
async function researchArthouse() {
  console.log('\n===== ARTHOUSE CROUCH END - ACTUAL STRUCTURE =====');
  const res = await fetch('https://www.arthousecrouchend.co.uk/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('HTML length:', html.length);

  // Print lines 1-200 to see the page structure
  const lines = html.split('\n');
  console.log('\n--- FIRST 150 non-empty lines ---');
  let count = 0;
  for (let i = 0; i < lines.length && count < 150; i++) {
    const line = lines[i].trim();
    if (line && (line.includes('class=') || line.includes('<div') || line.includes('<label') || line.includes('<a') || line.includes('<h'))) {
      console.log(`L${i}: ${line.substring(0, 250)}`);
      count++;
    }
  }

  // Find all <label> elements
  console.log('\n--- ALL LABEL ELEMENTS ---');
  $('label').each((i, el) => {
    const text = $(el).text().trim();
    const cls = $(el).attr('class') || '';
    const forAttr = $(el).attr('for') || '';
    console.log(`Label ${i}: "${text}" class="${cls}" for="${forAttr}"`);
  });

  // Find what contains the savoysystems links and booking anchors
  console.log('\n--- BOOKING LINK PARENTS ---');
  $('a[href*="savoysystems"]').each((i, el) => {
    if (i < 5) {
      const parent = $(el).parent();
      const gp = parent.parent();
      console.log(`BookLink ${i}: text="${$(el).text().trim().substring(0,30)}" href="${$(el).attr('href')?.substring(0,60)}"`);
      console.log(`  parent: <${parent[0]?.name} class="${parent.attr('class')}">`);
      console.log(`  gp: <${gp[0]?.name} class="${gp.attr('class')}">`);
      const ggp = gp.parent();
      console.log(`  ggp: <${ggp[0]?.name} class="${ggp.attr('class')}">`);
    }
  });

  // Find programme links
  console.log('\n--- PROGRAMME LINKS ---');
  $('a[href*="programme"]').each((i, el) => {
    if (i < 5) {
      const title = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const parent = $(el).parent();
      console.log(`Prog ${i}: "${title}" href="${href}" parent=<${parent[0]?.name} class="${parent.attr('class')}">`);
    }
  });
}

// ── ActOne: Try TicketSource ─────────────────────────────────────────────────
async function researchActOneTicketSource() {
  console.log('\n===== ACTONE via TICKETSOURCE =====');
  const res = await fetch('https://www.ticketsource.co.uk/whats-on/acton/actone-cinema-and-cafe', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Status:', res.status, 'Length:', html.length);

  // Look for event listings
  $('[class*="event"], [class*="show"], [class*="listing"]').each((i, el) => {
    if (i < 5) {
      const cls = $(el).attr('class');
      const text = $(el).text().trim().substring(0, 100);
      console.log(`Event el ${i}: <${el.name} class="${cls}"> "${text}"`);
    }
  });

  // First 3000 chars
  console.log('\nFirst 2000 chars of TicketSource page:');
  console.log(html.substring(0, 2000));
}

await researchGenesis();
await researchArthouse();
await researchActOneTicketSource();
