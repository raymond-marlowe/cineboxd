import * as cheerio from 'cheerio';

const res = await fetch('https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const html = await res.text();

// Look for var Events or similar JSON data patterns (same as Rio Cinema)
const lines = html.split('\n');

// Search for Event data variable
console.log('Searching for data patterns...');
lines.forEach((line, i) => {
  const l = line.trim();
  if (l.startsWith('var Events') || l.startsWith('var Films') || l.startsWith('var aEvents') ||
      l.startsWith('var AllFilms') || l.startsWith('var WhatsOn') ||
      (l.startsWith('var ') && (l.includes('"Title"') || l.includes('"ID"') || l.includes('"Performances"')))) {
    console.log(`Line ${i}: ${l.substring(0, 200)}`);
    // Print next 3 lines too
    lines.slice(i+1, i+4).forEach((nl, j) => console.log(`  +${j+1}: ${nl.substring(0, 200)}`));
  }
});

// Also look for any large JSON-like blocks
console.log('\n--- Script tag content check ---');
const $ = cheerio.load(html);
$('script').each((i, el) => {
  const content = $(el).text();
  // Look for scripts with event/film data
  if (content.includes('aEvent') || content.includes('Events') || content.includes('"Title"')) {
    if (content.includes('[{') || content.includes('= {')) {
      console.log(`Script ${i} (${content.length} chars): starts with`, content.substring(0, 300));
      console.log('...');
      // Find the JSON data part
      const jsonMatch = content.match(/var\s+\w+\s*=\s*(\[[\s\S]*?\]);/);
      if (jsonMatch) {
        console.log('Found JSON array!', jsonMatch[0].substring(0, 500));
      }
    }
  }
});

// Search for "Title" in script blocks - find where the film data is defined
console.log('\n--- Lines with JSON-like film data ---');
let count = 0;
lines.forEach((line, i) => {
  if (line.includes('"Title"') && line.includes('"ID"') && count < 5) {
    console.log(`Line ${i}: ${line.substring(0, 300)}`);
    count++;
  }
});

// Look for the Events variable specifically
console.log('\n--- Searching for "var " data declarations ---');
lines.forEach((line, i) => {
  const l = line.trim();
  if (l.match(/^var\s+[A-Z]\w+\s*=/) && l.length > 20 && !l.includes('function')) {
    console.log(`Line ${i}: ${l.substring(0, 200)}`);
  }
});
