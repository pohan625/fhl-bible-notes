// Build a lightweight "design-handoff" version of the app.
//
// Why: the production index.html embeds 9.68 MB of full Bible commentary so
// it works fully offline. That's far too heavy to drop into Claude Design or
// any other UI iteration tool. This script produces `build/design-handoff.html`
// (typically <100 KB) using the SAME template/CSS/JS but with a small sample
// of real data — enough to demo every screen state.
//
// Sample data:
//   - books[]              : full list of 66 books (so the home grid is real)
//   - authorPrefaces       : only for the sample books
//   - intros               : only for the sample books
//   - chapters             : only for the sample books, only first N chapters
//
// Books with no embedded chapter text fall through to the "本章暫無註釋內容"
// empty state, which is itself a designable state.

const fs = require('fs');
const path = require('path');

// Sample books and which chapters to embed for each.
const SAMPLE = {
  '創世記':   { chapters: [1, 2, 3], includeIntro: true, includePreface: true },
  '馬太福音': { chapters: [1, 2],    includeIntro: true, includePreface: true },
  '俄巴底亞書': { chapters: [1],     includeIntro: true, includePreface: false },
};

const fullData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

// Trim the data to the sample.
const trimmed = {
  books: fullData.books, // full list — needed for the home grid
  authorPrefaces: {},
  intros: {},
  chapters: {},
};
for (const [book, opts] of Object.entries(SAMPLE)) {
  if (opts.includePreface) {
    trimmed.authorPrefaces[book] = fullData.authorPrefaces[book];
  }
  if (opts.includeIntro) {
    trimmed.intros[book] = fullData.intros[book];
  }
  trimmed.chapters[book] = {};
  for (const ch of opts.chapters) {
    const text = (fullData.chapters[book] || {})[String(ch)];
    if (text) trimmed.chapters[book][String(ch)] = text;
  }
}

// Books not in SAMPLE: leave empty (no preface, no intro, no chapter text).
// They still appear on the home grid via the static OT_BOOKS/NT_BOOKS arrays.

if (!template.includes('__BIBLE_DATA__')) {
  console.error('template.html is missing the __BIBLE_DATA__ placeholder');
  process.exit(1);
}

// Pretty-print for readability when the file is opened in a design tool.
const json = JSON.stringify(trimmed, null, 2);
const out = template.replace('__BIBLE_DATA__', () => json);

// Tag the output with a comment so it's obvious which build this is.
const banner = `<!--
  ⚠️  THIS IS THE DESIGN HANDOFF BUILD ⚠️

  Data is intentionally trimmed for use in design tools (e.g. Claude Design).
  Only these books have embedded content:
${Object.entries(SAMPLE).map(([b, o]) => `    - ${b} (chapters ${o.chapters.join(', ')}${o.includeIntro ? ', + intro' : ''}${o.includePreface ? ', + preface' : ''})`).join('\n')}

  All 66 books still appear on the home grid (so OT/NT layout, categories,
  search, etc. all render realistically). Tapping into an unsampled book
  shows the empty state — which is itself a designable state.

  To re-pack with the full commentary text: run \`node build/build.js\` to
  produce the full /index.html.
-->
`;

const outPath = path.join(__dirname, '..', 'design', 'design-handoff.html');
fs.writeFileSync(outPath, banner + out);
const sz = fs.statSync(outPath).size;
console.log('Wrote ' + outPath + ' (' + (sz / 1024).toFixed(1) + ' KB)');
