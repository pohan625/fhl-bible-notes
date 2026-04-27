// Extract per-book / per-chapter commentary from source/fhl_bible_offline/index.html
// Output: build/data.json with shape:
//   {
//     books: [
//       { name, code, testament, hasIntro, hasAuthor, chapterCount }
//     ],
//     authorPrefaces: { [bookName]: string | null },
//     intros: { [bookName]: [{ title: string, body: string }] },
//     chapters: { [bookName]: { [chapterNum: string]: string } }
//   }

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'source', 'fhl_bible_offline', 'index.html'), 'utf8');
const m = HTML.match(/const books = (\[[\s\S]*?\]);\s*\n/);
if (!m) { console.error('books array not found'); process.exit(1); }
const books = JSON.parse(m[1]);

// Source chapter counts (using design defaults for known books, supplemented with the canonical Bible chapter counts).
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

// Locate the index where chapter content begins.
// Heuristic: the body of every book has a clear structural transition from
// "intro" (零、 一、 二、 ...) to "chapter content" (typically marked by 壹、 貳、 ...).
// Strategy:
//   1. Try to find the first paragraph that begins (top-level) with one of
//      壹/貳/參/肆/伍/陸/柒/捌/玖/拾 followed by 、 — that's chapter content.
//   2. Else fall back to: find first paragraph that mentions a verse range
//      "1:" or "1:1" in its first line where the first line is at indentation 0
//      and is NOT a section header beginning with 零/一/二/...
function findChapterStart(text) {
  const blocks = splitBlocks(text);
  // Pass 1: look for 壹、/貳、/...
  for (let i = 0; i < blocks.length; i++) {
    const first = blocks[i].split('\n')[0];
    if (/^[壹貳參肆伍陸柒捌玖拾][、，]/.test(first)) {
      return blocks[i].offsetStart;
    }
  }
  // Pass 2: first paragraph whose first line has a verse-range and looks like a
  // top-level chapter section header.
  for (let i = 0; i < blocks.length; i++) {
    const first = blocks[i].split('\n')[0];
    if (/(?:^|\s)1:\d/.test(first) && !/^\s/.test(first) && !/^[零一二三四五六七八九十]、/.test(first)) {
      return blocks[i].offsetStart;
    }
  }
  // Pass 3: first paragraph anywhere that has a 1: reference and is past the intro
  // markers (零、/一、/二、 at top level).
  let sawIntro = false;
  for (let i = 0; i < blocks.length; i++) {
    const first = blocks[i].split('\n')[0];
    if (/^[零一二三四五六七八九十]、/.test(first)) {
      sawIntro = true;
      continue;
    }
    if (sawIntro && /1:\d/.test(blocks[i].body)) return blocks[i].offsetStart;
  }
  return -1;
}

// Split text into paragraph blocks (separated by blank lines), preserving
// each block's body and starting offset in the original text.
function splitBlocks(text) {
  const blocks = [];
  const re = /([^\n][\s\S]*?)(?=\n\s*\n|\n*$)/g;
  let prevEnd = 0;
  // Simpler: split keeping offsets manually.
  const lines = text.split('\n');
  let cur = [];
  let curStart = 0;
  let pos = 0;
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      if (cur.length > 0) {
        const body = cur.join('\n');
        blocks.push({
          body,
          offsetStart: curStart,
          split(sep) { return body.split(sep); },
        });
        cur = [];
      }
      // advance
      if (line === undefined) break;
      pos += line.length + 1;
      curStart = pos;
    } else {
      if (cur.length === 0) curStart = pos;
      cur.push(line);
      pos += line.length + 1;
    }
  }
  return blocks;
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

// Parse chapter text into a map { chapter: text }.
// Strategy: walk paragraphs in order, tracking the "current" chapter and
// advancing forward when references hint at a later chapter.
function parseChapters(chapterText, maxChapters) {
  const blocks = splitBlocks(chapterText);
  const result = {};
  let current = 1;
  const refRe = /(?<![\d])(\d{1,3}):(\d{1,3})/g;
  // Match "第X篇" and capture the Chinese number (used for Psalms-like format).
  const cnNumToInt = (cn) => {
    if (/^\d+$/.test(cn)) return parseInt(cn, 10);
    const map = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (cn.length === 1 && map[cn] !== undefined) return map[cn];
    if (cn === '十') return 10;
    if (cn.startsWith('十')) return 10 + cnNumToInt(cn.slice(1));
    if (cn.endsWith('十')) return cnNumToInt(cn.slice(0, -1)) * 10;
    if (cn.includes('十')) {
      const [a, b] = cn.split('十');
      return cnNumToInt(a) * 10 + cnNumToInt(b);
    }
    if (cn.includes('百')) {
      const [a, b] = cn.split('百');
      const hundred = (a ? cnNumToInt(a) : 1) * 100;
      if (!b) return hundred;
      // "百零N" or "百N十" etc. — treat the rest recursively.
      return hundred + cnNumToInt(b.replace(/^零/, ''));
    }
    return NaN;
  };

  for (const block of blocks) {
    const text = block.body;
    const firstLine = text.split('\n')[0];

    // Pass A: explicit chapter from a section header. A "section header" is the
    // first line of a paragraph that begins with a structural marker (壹/貳/...
    // or 一/二/... or （X） or N. or ☆ etc.) AND ends with one of:
    //   - a chapter:verse range like "X:Y" or "X:Y-A:B"  → use X (the start chapter)
    //   - "第N篇"  → use N (Psalms format)
    //   - a bare trailing chapter number like "  20"     → use that
    let explicit = null;
    const isSectionHeader =
      /^[\s　]*[（(][一二三四五六七八九十百\d]+[）)]/.test(firstLine) ||
      /^[\s　]*[壹貳參肆伍陸柒捌玖拾]、/.test(firstLine) ||
      /^[\s　]*[一二三四五六七八九十百千]+、/.test(firstLine) ||
      /^[\s　]*[甲乙丙丁戊己庚辛壬癸]、/.test(firstLine) ||
      /^[\s　]*\d+\.[^\d:]/.test(firstLine) ||
      /^[\s　]*[★☆]/.test(firstLine);
    if (isSectionHeader) {
      const mPsalm = firstLine.match(/第([零一二三四五六七八九十百\d]+)篇/);
      if (mPsalm) {
        const n = cnNumToInt(mPsalm[1]);
        if (n >= 1 && n <= maxChapters) explicit = n;
      }
      if (explicit == null) {
        // Look for a chapter:verse pattern in the header. Take the FIRST one.
        const mRange = firstLine.match(/(?<![\d])(\d{1,3}):\d{1,3}/);
        if (mRange) {
          const n = parseInt(mRange[1], 10);
          if (n >= 1 && n <= maxChapters) explicit = n;
        }
      }
      if (explicit == null) {
        // Trailing bare chapter at end of header line (e.g. "  X、X章  20").
        const mBare = firstLine.match(/[\s　]+(\d{1,3})\s*$/);
        if (mBare) {
          const n = parseInt(mBare[1], 10);
          if (n >= 1 && n <= maxChapters) explicit = n;
        }
      }
    }

    // Pass B: count chapter:verse refs by chapter.
    const counts = new Map();
    refRe.lastIndex = 0;
    let mt;
    while ((mt = refRe.exec(text))) {
      const ch = parseInt(mt[1], 10);
      if (ch >= 1 && ch <= maxChapters) counts.set(ch, (counts.get(ch) || 0) + 1);
    }

    // Determine target chapter.
    //   - Explicit (section header) wins.
    //   - Otherwise (detail paragraph): use majority-count heuristic with a
    //     "stay on current if mentioned" preference and a "prefer forward over
    //     backward" tie-break to handle paragraphs that genuinely advance to
    //     the next chapter.
    let target;
    if (explicit != null) {
      target = explicit;
    } else if (counts.size === 0) {
      target = current;
    } else {
      let maxC = 0;
      for (const v of counts.values()) if (v > maxC) maxC = v;
      const candidates = [...counts.entries()].filter(([, c]) => c === maxC).map(([k]) => k);
      if (candidates.includes(current)) {
        target = current;
      } else {
        const fwdCand = candidates.filter((c) => c > current);
        if (fwdCand.length > 0) target = Math.min(...fwdCand);
        else target = Math.max(...candidates); // fallback (allows backward)
      }
    }
    current = target;

    if (!result[String(target)]) result[String(target)] = '';
    result[String(target)] += (result[String(target)] ? '\n\n' : '') + text;
  }
  return result;
}

// === Main ===
const out = {
  books: [],
  authorPrefaces: {},
  intros: {},
  chapters: {},
};

for (const b of books) {
  const max = CHAPTER_COUNTS[b.name];
  if (!max) {
    console.warn('No chapter count for book:', b.name);
    continue;
  }
  const { preface, rest } = extractAuthorPreface(b.content);

  // Strip the leading book-title line ("創世記研經資料" / "羅馬書" / etc).
  // The first non-empty line of `rest` is the book title — drop it.
  const restLines = rest.split('\n');
  let firstNonEmpty = -1;
  for (let i = 0; i < restLines.length; i++) {
    if (restLines[i].trim() !== '') { firstNonEmpty = i; break; }
  }
  let body = rest;
  if (firstNonEmpty >= 0) {
    // If the line is short and matches "<bookname>研經資料|<bookname>查經資料|<bookname>"
    const ln = restLines[firstNonEmpty].trim();
    if (ln.length <= 20 && (ln.includes('研經資料') || ln.includes('查經資料') || ln === b.name)) {
      restLines.splice(firstNonEmpty, 1);
      body = restLines.join('\n').replace(/^\s+/, '');
    }
  }

  // Find chapter-content start on the RAW body so intro structure is preserved
  // line-for-line.
  const cstart = findChapterStart(body);
  let introRaw, chapterRaw;
  if (cstart < 0) {
    introRaw = '';
    chapterRaw = body;
  } else {
    introRaw = body.slice(0, cstart).replace(/\s+$/, '');
    chapterRaw = body.slice(cstart);
  }

  // Unwrap chapter text (merges soft-wraps inside paragraphs).
  const chapterUnwrapped = unwrapParagraphs(chapterRaw);

  const intro = parseIntro(introRaw);
  // Unwrap each intro section body separately so soft-wraps are merged but
  // titles stay intact.
  for (const s of intro) s.body = unwrapBodyText(s.body);

  const chapters = parseChapters(chapterUnwrapped, max);

  // Sanity: if a single-chapter book ended up with no chapter 1, but had body
  // text past the intro, just put it all in chapter 1.
  if (max === 1 && !chapters['1']) {
    chapters['1'] = chapterText.trim();
  }

  out.books.push({
    name: b.name,
    code: b.code,
    testament: b.testament,
    chapterCount: max,
    hasIntro: intro.length > 0,
    hasAuthor: !!preface,
  });
  out.authorPrefaces[b.name] = preface;
  out.intros[b.name] = intro;
  out.chapters[b.name] = chapters;
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
