// Inspect the source data: extract `const books = [...]` and look at a few books.
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'source', 'fhl_bible_offline', 'index.html'), 'utf8');

const m = HTML.match(/const books = (\[[\s\S]*?\]);\s*\n/);
if (!m) {
  console.error('books array not found');
  process.exit(1);
}
const arrText = m[1];
const books = JSON.parse(arrText);
console.log('book count:', books.length);

function head(s, n) {
  return s.length > n ? s.slice(0, n) + '...' : s;
}

// Inspect a few different books
['創世記', '詩篇', '馬太福音', '羅馬書', '啟示錄', '俄巴底亞書', '腓利門書'].forEach((name) => {
  const b = books.find((x) => x.name === name);
  if (!b) {
    console.log('--- not found:', name);
    return;
  }
  console.log('\n=== ' + name + ' (testament=' + b.testament + ', length=' + b.content.length + ') ===');
  // Show the first 800 chars and last 500 chars
  console.log('--- HEAD ---');
  console.log(head(b.content, 800));
  console.log('--- TAIL ---');
  const tail = b.content.slice(-600);
  console.log(tail);
});
