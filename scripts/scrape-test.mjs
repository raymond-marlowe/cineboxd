// Temporary research script — fetch raw HTML and print structural info
const sites = [
  { name: 'Genesis', url: 'https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn' },
  { name: 'Arthouse', url: 'https://www.arthousecrouchend.co.uk/', headers: { 'User-Agent': 'Mozilla/5.0' } },
  { name: 'ActOne', url: 'https://www.actonecinema.co.uk/whats-on/', headers: { 'User-Agent': 'Mozilla/5.0' } },
];

for (const site of sites) {
  console.log('\n' + '='.repeat(60));
  console.log(site.name + ' — ' + site.url);
  console.log('='.repeat(60));
  try {
    const res = await fetch(site.url, { headers: site.headers ?? {} });
    const html = await res.text();
    console.log('Status:', res.status, '  Length:', html.length);
    // Print first 4000 chars to see the structure
    console.log(html.substring(0, 4000));
    console.log('\n--- SEARCHING FOR KEY PATTERNS ---');
    const lines = html.split('\n');
    lines.forEach((line, i) => {
      const l = line.trim();
      if (l.includes('class=') && (l.includes('date') || l.includes('film') || l.includes('event') || l.includes('perf') || l.includes('show') || l.includes('time'))) {
        console.log(`  L${i}: ${l.substring(0, 200)}`);
      }
    });
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
