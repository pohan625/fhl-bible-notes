// Extract per-book / per-chapter commentary from the fetched JSON API dump.
//
// Pipeline position:
//   fetch.js  →  source/sc_api_dump.json  →  *extract.js*  →  build/data.json  →  build.js  →  public/index.html
//
// Input: source/sc_api_dump.json (produced by build/fetch.js from bible.fhl.net/api/sc.php)
//   {
//     books: {
//       [bookName]: {
//         bid, engs, testament, chapterCount,
//         preBook: string,                    // raw text from chap=0,sec=0
//         chapters: { [chap]: string }        // raw text per chapter
//       }
//     }
//   }
//
// Output: build/data.json
//   {
//     books: [{ name, code, testament, hasIntro, hasAuthor, chapterCount }],
//     authorPrefaces: { [bookName]: string | null },
//     intros: { [bookName]: [{ title: string, body: string }] },
//     chapters: { [bookName]: { [chapterNum: string]: string } }
//   }
//
// Why this two-stage design: fetch.js does the network-sensitive work and is
// idempotent; extract.js is pure parsing and reproducible. Re-running extract
// alone is fast (~1s) so the renderer can be iterated on without re-fetching.

const fs = require('fs');
const path = require('path');

const DUMP_PATH = path.join(__dirname, '..', 'source', 'sc_api_dump.json');
if (!fs.existsSync(DUMP_PATH)) {
  console.error(`Missing ${DUMP_PATH} — run \`node build/fetch.js\` first.`);
  process.exit(1);
}
const dump = JSON.parse(fs.readFileSync(DUMP_PATH, 'utf8'));

// Canonical chapter counts. Used for completeness reporting only — the actual
// chapter set is whatever the API returned.
const CHAPTER_COUNTS = {
  '創世記': 50, '出埃及記': 40, '利未記': 27, '民數記': 36, '申命記': 34,
  '約書亞記': 24, '士師記': 21, '路得記': 4, '撒母耳記上': 31, '撒母耳記下': 24,
  '列王紀上': 22, '列王紀下': 25, '歷代志上': 29, '歷代志下': 36,
  '以斯拉記': 10, '尼希米記': 13, '以斯帖記': 10,
  '約伯記': 42, '詩篇': 150, '箴言': 31, '傳道書': 12, '雅歌': 8,
  '以賽亞書': 66, '耶利米書': 52, '耶利米哀歌': 5, '以西結書': 48, '但以理書': 12,
  '何西阿書': 14, '約珥書': 3, '阿摩司書': 9, '俄巴底亞書': 1, '約拿書': 4,
  '彌迦書': 7, '那鴻書': 3, '哈巴谷書': 3, '西番雅書': 3, '哈該書': 2,
  '撒迦利亞書': 14, '瑪拉基書': 4,
  '馬太福音': 28, '馬可福音': 16, '路加福音': 24, '約翰福音': 21, '使徒行傳': 28,
  '羅馬書': 16, '哥林多前書': 16, '哥林多後書': 13, '加拉太書': 6,
  '以弗所書': 6, '腓利比書': 4, '歌羅西書': 4,
  '帖撒羅尼迦前書': 5, '帖撒羅尼迦後書': 3,
  '提摩太前書': 6, '提摩太後書': 4, '提多書': 3, '腓利門書': 1,
  '希伯來書': 13, '雅各書': 5, '彼得前書': 5, '彼得後書': 3,
  '約翰壹書': 5, '約翰貳書': 1, '約翰參書': 1, '猶大書': 1, '啟示錄': 22
};

// Normalize line endings: the API returns CRLF, our parsers all assume LF.
function normalizeLines(s) {
  return (s || '').replace(/\r\n?/g, '\n');
}

// Strip author preface comment, unwrapping soft-wrapped lines within paragraphs.
function extractAuthorPreface(content) {
  const re = /^\s*\/\*+\s*\n([\s\S]*?)\n\*+\/\s*\n?/;
  const m = content.match(re);
  if (!m) return { preface: null, rest: content };
  // Within each blank-line-separated paragraph, join wrapped lines.
  const blocks = m[1].split(/\n\s*\n/);
  const joined = blocks
    .map((b) => b.split('\n').map((l) => l.replace(/^\s+|\s+$/g, '')).filter((l) => l.length > 0).join(''))
    .filter((b) => b.length > 0)
    .join('\n\n');
  return { preface: joined.trim(), rest: content.slice(m[0].length) };
}

// Unwrap soft-wrapped lines within an intro section body. Lines starting with
// a known body marker (●/◎/○/（X）/N./甲/乙/...) keep their identity; deeper
// continuation lines merge into the most recent body line.
function unwrapBodyText(body) {
  if (!body) return '';
  const lines = body.split('\n');
  const isMarker = (s) => {
    const t = s.replace(/^[\s　]+/, '');
    return (
      /^[●○◎★☆■□◆◇※→←*]/.test(t) ||
      /^[（(][一二三四五六七八九十百千\d]+[）)]/.test(t) ||
      /^[甲乙丙丁戊己庚辛壬癸][、，]/.test(t) ||
      /^\d+[\.\、．]/.test(t) ||
      /^\(\s*\d+\s*\)/.test(t)
    );
  };
  const out = [];
  for (const line of lines) {
    if (line.trim() === '') {
      out.push('');
      continue;
    }
    if (out.length === 0 || isMarker(line) || out[out.length - 1].trim() === '') {
      out.push(line);
    } else {
      out[out.length - 1] = out[out.length - 1] + line.replace(/^[\s　]+/, '');
    }
  }
  return out.join('\n').replace(/^\n+|\n+$/g, '');
}

// Merge soft-wrapped Chinese paragraph lines into a single line.
// Heuristic: within a "logical paragraph" (lines separated by blank lines),
// join consecutive lines that are wrapped — but preserve the relative indentation
// of the *first* line. When a wrapped line is detected, drop the leading whitespace
// from the continuation and concatenate directly (no extra space, since the source
// is CJK).
function unwrapParagraphs(text) {
  // Split into blank-line-separated blocks, but preserve the blank lines.
  const blocks = text.split(/\n\s*\n/);
  const unwrapped = blocks.map((block) => {
    // Within the block, treat it as a sequence of "logical lines": a logical line
    // starts at a non-blank line whose content begins with a "header-like" marker
    // (such as 壹、/一、/（一）/1./(1)/●/◎/☆/* etc.) OR starts at the beginning of
    // the block. Subsequent lines whose first non-whitespace character is a CJK
    // body character (not a marker) are considered wrapped continuations and merged.
    const lines = block.split('\n');
    const out = [];
    const isMarkerStart = (s) => {
      const t = s.replace(/^\s+/, '');
      // Common markers in this commentary corpus
      return (
        /^[壹貳參肆伍陸柒捌玖拾][、．\.]/.test(t) ||
        /^[零一二三四五六七八九十][、．\.]/.test(t) ||
        /^（[一二三四五六七八九十百千]+）/.test(t) ||
        /^[甲乙丙丁戊己庚辛壬癸][、．\.]/.test(t) ||
        /^\d+[\.\、．]/.test(t) ||
        /^\(\s*\d+\s*\)/.test(t) ||
        /^[●○◎★☆■□◆◇※→←*]/.test(t) ||
        /^[A-Za-z][\.\)]/.test(t) ||
        /^\s*$/.test(t)
      );
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        out.push('');
        continue;
      }
      if (out.length === 0 || isMarkerStart(line) || out[out.length - 1].trim() === '') {
        out.push(line);
      } else {
        // Continuation — strip leading whitespace and append.
        out[out.length - 1] = out[out.length - 1] + line.replace(/^\s+/, '');
      }
    }
    return out.join('\n');
  });
  return unwrapped.join('\n\n');
}

// Parse intro sections out of pre-chapter text.
// Sections are detected as paragraphs whose first line at depth 0 starts with
// a Chinese ordinal "零、|一、|二、|...|☆|* (★)|..." marker. Section bodies
// continue until the next such marker.
function parseIntro(introText) {
  const lines = introText.split('\n');
  const sections = [];
  let cur = null;
  // In intros, the corpus uses "零、背景" at indent 0 as a wrapper, then 一、二、…
  // at indent 2 as the actual top-level sections, plus ☆/★ markers at indent 0.
  // Treat all of these as top-level section starters.
  const isTopHeader = (line) => {
    if (line.length === 0) return false;
    const t = line.replace(/^[\s　]+/, '');
    if (!t) return false;
    return (
      /^[零一二三四五六七八九十百千]+[、，]/.test(t) ||
      /^[壹貳參肆伍陸柒捌玖拾][、，]/.test(t) ||
      /^☆/.test(t) ||
      /^★/.test(t)
    );
  };
  for (const line of lines) {
    if (isTopHeader(line)) {
      if (cur) sections.push(cur);
      // Title is the line, with optional trailing "：" stripped for display.
      const title = line.replace(/[:：]\s*$/, '').trim();
      cur = { title, body: '' };
    } else {
      if (!cur) {
        // Lines before the first header — treat as a "preamble" section.
        if (line.trim() === '') continue;
        cur = { title: '', body: line };
      } else {
        cur.body += (cur.body ? '\n' : '') + line;
      }
    }
  }
  if (cur) sections.push(cur);
  // Trim bodies.
  return sections
    .map((s) => ({ title: s.title, body: s.body.replace(/^\n+|\n+$/g, '') }))
    .filter((s) => s.title || s.body);
}

// Strip the leading book-title line ("創世記研經資料" / "羅馬書" / etc).
// Returns the body without that line.
function stripBookTitleLine(rest, bookName) {
  const restLines = rest.split('\n');
  let firstNonEmpty = -1;
  for (let i = 0; i < restLines.length; i++) {
    if (restLines[i].trim() !== '') { firstNonEmpty = i; break; }
  }
  if (firstNonEmpty < 0) return rest;
  const ln = restLines[firstNonEmpty].trim();
  if (ln.length <= 20 && (ln.includes('研經資料') || ln.includes('查經資料') || ln === bookName)) {
    restLines.splice(firstNonEmpty, 1);
    return restLines.join('\n').replace(/^\s+/, '');
  }
  return rest;
}

// === Main ===
const out = {
  books: [],
  authorPrefaces: {},
  intros: {},
  chapters: {},
};

// Iterate in canonical order (sorted by `bid` from the dump payload).
const bookEntries = Object.entries(dump.books)
  .map(([name, payload]) => ({ name, payload }))
  .sort((a, b) => (a.payload.bid || 0) - (b.payload.bid || 0));

for (const { name, payload } of bookEntries) {
  const max = CHAPTER_COUNTS[name] || payload.chapterCount;
  if (!max) {
    console.warn('No chapter count for book:', name);
    continue;
  }

  // 1. Pre-book content — author preface + book title line + intros + 參考資料.
  const preBookRaw = normalizeLines(payload.preBook || '');
  const { preface, rest } = extractAuthorPreface(preBookRaw);
  const introBody = stripBookTitleLine(rest, name);
  const intros = parseIntro(introBody);
  for (const s of intros) s.body = unwrapBodyText(s.body);

  // 2. Chapter content — already split by chapter via the API's `next` chain
  //    in fetch.js. We just unwrap soft-wraps within each chapter so the
  //    template renderer sees clean blank-line-separated paragraphs.
  const chapters = {};
  for (const [chapKey, chapText] of Object.entries(payload.chapters || {})) {
    const normalized = normalizeLines(chapText);
    chapters[chapKey] = unwrapParagraphs(normalized);
  }

  out.books.push({
    name,
    code: payload.engs || '',
    testament: payload.testament || '',
    chapterCount: max,
    hasIntro: intros.length > 0,
    hasAuthor: !!preface,
  });
  out.authorPrefaces[name] = preface;
  out.intros[name] = intros;
  out.chapters[name] = chapters;
}

const outPath = path.join(__dirname, 'data.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const stat = fs.statSync(outPath);

// Quick sanity report.
let totalBooks = out.books.length;
let totalChapterContent = 0;
let booksMissingChapter1 = 0;
let booksAllChapters = 0;
for (const b of out.books) {
  const chs = out.chapters[b.name];
  const present = Object.keys(chs).length;
  totalChapterContent += present;
  if (!chs['1']) booksMissingChapter1++;
  if (present === b.chapterCount) booksAllChapters++;
}
console.log('Books:', totalBooks);
console.log('Books with all chapters present:', booksAllChapters);
console.log('Books missing chapter 1:', booksMissingChapter1);
console.log('Total chapters extracted:', totalChapterContent);
console.log('Output:', outPath, '(' + (stat.size / 1024 / 1024).toFixed(2) + ' MB)');

// Per-book report — show missing chapters.
for (const b of out.books) {
  const chs = out.chapters[b.name];
  const present = Object.keys(chs).length;
  const missing = [];
  for (let i = 1; i <= b.chapterCount; i++) if (!chs[String(i)]) missing.push(i);
  if (missing.length > 0) {
    console.log(`  ${b.name}: ${present}/${b.chapterCount} (missing: ${missing.slice(0, 10).join(',')}${missing.length > 10 ? '…' : ''}); intro=${out.intros[b.name].length} sections; preface=${out.authorPrefaces[b.name] ? 'yes' : 'no'}`);
  }
}
