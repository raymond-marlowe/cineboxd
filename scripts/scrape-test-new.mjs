import * as cheerio from 'cheerio';

// ── Test Genesis ─────────────────────────────────────────────────────────────
async function testGenesis() {
  console.log('\n===== GENESIS CINEMA =====');
  const res = await fetch('https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn');
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings = [];

  $('div.whatson_panel').each((_, panel) => {
    const id = $(panel).attr('id') || '';
    const m = id.match(/panel_(\d{4})(\d{2})(\d{2})/);
    const date = m ? `${m[1]}-${m[2]}-${m[3]}` : '?';

    const seen = new Set();
    $(panel).find('div.grid-container-border').each((_, film) => {
      const rawTitle = $(film).find('h2.text-black > a').first().text().trim();
      if (!rawTitle) return;
      const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
      const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;

      $(film).find('.perfButton').each((_, btn) => {
        const href = $(btn).attr('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        screenings.push({ title: title.substring(0, 35), date, time: $(btn).text().trim(), href: href.substring(0, 60) });
      });
    });
  });

  console.log(`Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── Test Arthouse ─────────────────────────────────────────────────────────────
const MONTH_MAP = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

function parseDateLabel(label) {
  const today = new Date();
  if (/today/i.test(label)) return today.toISOString().split('T')[0];
  const match = label.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return today.toISOString().split('T')[0];
  const day = parseInt(match[1], 10);
  const month = MONTH_MAP[match[2]];
  if (month === undefined) return today.toISOString().split('T')[0];
  let year = today.getFullYear();
  if (month < today.getMonth()) year++;
  return new Date(year, month, day).toISOString().split('T')[0];
}

async function testArthouse() {
  console.log('\n===== ARTHOUSE CROUCH END =====');
  const res = await fetch('https://www.arthousecrouchend.co.uk/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings = [];

  const tabsEl = $('div.tabs').first();
  let currentDate = null;

  tabsEl.children().each((_, el) => {
    if (el.name === 'label') {
      currentDate = parseDateLabel($(el).text().trim());
    } else if ($(el).hasClass('tab') && currentDate !== null) {
      const date = currentDate;
      $(el).find('.programmeinfo').each((_, prog) => {
        const titleAnchor = $(prog).find('.show-title > a').first();
        const rawTitle = titleAnchor.clone().children().remove().end().text().trim();
        if (!rawTitle) return;
        const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
        const title = yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim() : rawTitle;

        $(prog).find('.OpenForSale > a, .SoldOut > a').each((_, booking) => {
          const linkText = $(booking).text().trim();
          const timeMatch = linkText.match(/^(\d{2}:\d{2})/);
          if (!timeMatch) return;
          const time = timeMatch[1];
          const href = $(booking).attr('href') || '';
          screenings.push({ title: title.substring(0, 35), date, time, href: href.substring(0, 60) });
        });
      });
    }
  });

  console.log(`Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

// ── Test ActOne ───────────────────────────────────────────────────────────────
function parseTime12h(timeText) {
  const match = timeText.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeText.trim();
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

async function testActOne() {
  console.log('\n===== ACTONE CINEMA =====');
  const res = await fetch('https://www.actonecinema.co.uk/whats-on/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const screenings = [];
  const today = new Date().toISOString().split('T')[0];
  const seen = new Set();

  const hiddenDiv = $('#q-app > div').first();
  hiddenDiv.find('p').each((_, p) => {
    const $p = $(p);
    if ($p.find('a[href*="/movie/"]').length === 0) return;
    let currentTitle = null;
    $p.contents().each((_, node) => {
      if (node.type !== 'tag' || node.name !== 'a') return;
      const $a = $(node);
      const href = $a.attr('href') || '';
      if (href.includes('/movie/')) {
        currentTitle = $a.text().trim().replace(/^["'""]|["'""]$/g, '').trim();
      } else if (href.includes('/checkout/showing/') && currentTitle) {
        if (seen.has(href)) return;
        seen.add(href);
        const time = parseTime12h($a.text().trim());
        screenings.push({ title: currentTitle.substring(0, 35), date: today, time, href: href.substring(0, 60) });
      }
    });
  });

  console.log(`Total screenings: ${screenings.length}`);
  screenings.slice(0, 5).forEach(s => console.log(' ', s));
}

await testGenesis();
await testArthouse();
await testActOne();
