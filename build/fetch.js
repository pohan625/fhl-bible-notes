// Fetch all commentary data from bible.fhl.net/api/sc.php (book=3 信望愛站註釋).
//
// Pipeline position:
//   fetch.js  →  source/sc_api_dump.json  →  extract.js  →  build/data.json  →  build.js  →  public/index.html
//
// Why we do this:
//   The previous data source was a snapshot of a2z.fhl.net/php/pcom.php which
//   serves a *rendered* HTML page — by the time it reached the offline export,
//   structural markup had already been destroyed (#…| cross-references became
//   bare text, SNG/SNH Strong numbers became "SG …" / "SH …" with a space).
//   This API returns the canonical raw markup, which preserves the option to
//   render cross-references as tappable spans and Strong numbers as styled
//   tokens in the future.
//
// Output shape (source/sc_api_dump.json):
//   {
//     fetchedAt: ISO-string,
//     apiSource: string,
//     books: {
//       [bookName]: {
//         bid: number,          // 1..66
//         engs: string,         // English short code from the API ("Matt", "Gen", ...)
//         preBook: string,      // raw text from chap=0,sec=0 — author preface + book intros
//         chapters: { [chap]: string }   // raw text per chapter (sections joined by "\n\n")
//       }
//     }
//   }
//
// Behaviour:
//   - Polite delay (200ms) between every request.
//   - Resume support: if source/sc_api_dump.json already exists, books that
//     already have a complete `chapters` map are skipped. Re-run the script
//     after a network blip to pick up where it left off.
//   - Markup is preserved verbatim — we do NOT touch `#…|` or `SNG/SNH`.

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'source', 'sc_api_dump.json');
const API_SOURCE = 'https://bible.fhl.net/api/sc.php (book=3 信望愛站註釋)';
const COMMENTARY_BOOK = 3; // 信望愛站註釋
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;

// Canonical 66-book order. `bid` is the index (1-based) used by the FHL API.
// `code` matches the engs short code used by the site for cross-referencing.
// Chapter counts are checked after fetching to validate completeness.
const BOOKS = [
  // OT (39)
  ['創世記', 'Gen', 'OT', 50],
  ['出埃及記', 'Ex', 'OT', 40],
  ['利未記', 'Lev', 'OT', 27],
  ['民數記', 'Num', 'OT', 36],
  ['申命記', 'Deut', 'OT', 34],
  ['約書亞記', 'Josh', 'OT', 24],
  ['士師記', 'Judg', 'OT', 21],
  ['路得記', 'Ruth', 'OT', 4],
  ['撒母耳記上', '1Sam', 'OT', 31],
  ['撒母耳記下', '2Sam', 'OT', 24],
  ['列王紀上', '1Kin', 'OT', 22],
  ['列王紀下', '2Kin', 'OT', 25],
  ['歷代志上', '1Chr', 'OT', 29],
  ['歷代志下', '2Chr', 'OT', 36],
  ['以斯拉記', 'Ezra', 'OT', 10],
  ['尼希米記', 'Neh', 'OT', 13],
  ['以斯帖記', 'Esth', 'OT', 10],
  ['約伯記', 'Job', 'OT', 42],
  ['詩篇', 'Ps', 'OT', 150],
  ['箴言', 'Prov', 'OT', 31],
  ['傳道書', 'Eccl', 'OT', 12],
  ['雅歌', 'Song', 'OT', 8],
  ['以賽亞書', 'Is', 'OT', 66],
  ['耶利米書', 'Jer', 'OT', 52],
  ['耶利米哀歌', 'Lam', 'OT', 5],
  ['以西結書', 'Ezek', 'OT', 48],
  ['但以理書', 'Dan', 'OT', 12],
  ['何西阿書', 'Hos', 'OT', 14],
  ['約珥書', 'Joel', 'OT', 3],
  ['阿摩司書', 'Amos', 'OT', 9],
  ['俄巴底亞書', 'Obad', 'OT', 1],
  ['約拿書', 'Jon', 'OT', 4],
  ['彌迦書', 'Mic', 'OT', 7],
  ['那鴻書', 'Nah', 'OT', 3],
  ['哈巴谷書', 'Hab', 'OT', 3],
  ['西番雅書', 'Zeph', 'OT', 3],
  ['哈該書', 'Hag', 'OT', 2],
  ['撒迦利亞書', 'Zech', 'OT', 14],
  ['瑪拉基書', 'Mal', 'OT', 4],
  // NT (27)
  ['馬太福音', 'Matt', 'NT', 28],
  ['馬可福音', 'Mark', 'NT', 16],
  ['路加福音', 'Luke', 'NT', 24],
  ['約翰福音', 'John', 'NT', 21],
  ['使徒行傳', 'Acts', 'NT', 28],
  ['羅馬書', 'Rom', 'NT', 16],
  ['哥林多前書', '1Cor', 'NT', 16],
  ['哥林多後書', '2Cor', 'NT', 13],
  ['加拉太書', 'Gal', 'NT', 6],
  ['以弗所書', 'Eph', 'NT', 6],
  ['腓利比書', 'Phil', 'NT', 4],
  ['歌羅西書', 'Col', 'NT', 4],
  ['帖撒羅尼迦前書', '1Thess', 'NT', 5],
  ['帖撒羅尼迦後書', '2Thess', 'NT', 3],
  ['提摩太前書', '1Tim', 'NT', 6],
  ['提摩太後書', '2Tim', 'NT', 4],
  ['提多書', 'Titus', 'NT', 3],
  ['腓利門書', 'Philem', 'NT', 1],
  ['希伯來書', 'Heb', 'NT', 13],
  ['雅各書', 'James', 'NT', 5],
  ['彼得前書', '1Pet', 'NT', 5],
  ['彼得後書', '2Pet', 'NT', 3],
  ['約翰壹書', '1John', 'NT', 5],
  ['約翰貳書', '2John', 'NT', 1],
  ['約翰參書', '3John', 'NT', 1],
  ['猶大書', 'Jude', 'NT', 1],
  ['啟示錄', 'Rev', 'NT', 22],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSection(bid, chap, sec) {
  // The query string is the same shape used by the website; only `book=3`
  // (which note book; here, the commentary book ID — confusingly named the
  // same as the canonical bible book index — corresponds to 信望愛站註釋).
  const url = `https://bible.fhl.net/api/sc.php?book=${COMMENTARY_BOOK}&bid=${bid}&chap=${chap}&sec=${sec}&gb=0`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.status !== 'success') throw new Error(`API status: ${JSON.stringify(json)}`);
      return json;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`  ! ${url} attempt ${attempt} failed: ${err.message}; retrying in ${RETRY_BACKOFF_MS}ms`);
      await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
}

// Parse a record's `title` (e.g. "馬太福音 1章1節 到 1章17節" or
// "傳道書 5章8節 到 6章12節") to figure out which chapters this segment spans.
// Returns [startChap, endChap]. Segments that span multiple chapters MUST
// be stored under each chapter (otherwise the in-between chapters end up empty
// because the API's `next` link jumps past them — see 傳道書 ch6 / 約翰福音
// ch14 in early dumps for examples of this exact bug).
function parseTitleRange(title) {
  if (!title) return null;
  const m = title.match(/(\d+)\s*章\s*\d+\s*節\s*到\s*(\d+)\s*章\s*\d+\s*節/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a) return null;
  return [a, b];
}

async function fetchBook({ name, code, testament, bid, expectedChapters }) {
  // 1. Pre-book content (chap=0,sec=0): preface + intros + reference list.
  await sleep(REQUEST_DELAY_MS);
  const pre = await fetchSection(bid, 0, 0);
  const preBook = pre.record_count > 0 ? pre.record[0].com_text : '';

  // 2. Walk chapter sections via the `next` chain. Each response describes a
  //    contiguous block (e.g. 1:1-17, 1:18-25, 2:1-12 …). Some blocks span
  //    multiple chapters (e.g. "5:8 to 6:12") — `next` then jumps to ch7,
  //    leaving ch6 empty unless we also store the block under ch6. We parse
  //    the segment title to detect the span and append the same com_text to
  //    every chapter the block covers. (The user-facing app shows commentary
  //    by chapter; a spanning block legitimately belongs to all of them, the
  //    same way the upstream a2z.fhl.net chapter view shows it.)
  const chapters = {};
  const appendToChapter = (chap, text) => {
    const key = String(chap);
    chapters[key] = (chapters[key] ? chapters[key] + '\n\n' : '') + text;
  };
  let chap = 1;
  let sec = 1;
  let safety = 0;
  while (true) {
    safety++;
    if (safety > 5000) throw new Error(`Section walk for ${name} exceeded 5000 iterations`);
    await sleep(REQUEST_DELAY_MS);
    const r = await fetchSection(bid, chap, sec);
    if (r.record_count === 0) break;
    const rec = r.record[0];

    const span = parseTitleRange(rec.title);
    if (span) {
      const [startChap, endChap] = span;
      for (let c = startChap; c <= endChap; c++) appendToChapter(c, rec.com_text);
    } else {
      // Fallback if title doesn't parse — store under the chapter we asked for.
      appendToChapter(chap, rec.com_text);
    }

    const next = r.next;
    if (!next) break;
    if (Number(next.bid) !== bid) break;       // crossed into another book
    if (Number(next.chap) === chap && Number(next.sec) === sec) {
      // Defensive: API returned the same coordinates — bail rather than loop.
      break;
    }
    chap = Number(next.chap);
    sec = Number(next.sec);
    if (chap === 0 && sec === 0) break;        // safety, shouldn't happen mid-book
  }

  return {
    bid,
    engs: code,
    testament,
    preBook,
    chapters,
    chapterCount: expectedChapters,
  };
}

function loadExistingDump() {
  if (!fs.existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch (err) {
    console.warn(`! Could not parse existing dump (${err.message}); starting fresh.`);
    return null;
  }
}

function saveDump(dump) {
  // Pretty-print at 0 indent — file is large, but git-diffable line-by-line
  // wouldn't help anyway since strings are big. Use no-indent JSON.
  fs.writeFileSync(OUT_PATH, JSON.stringify(dump));
}

function isComplete(payload, expectedChapters) {
  if (!payload || !payload.chapters) return false;
  for (let i = 1; i <= expectedChapters; i++) {
    if (!payload.chapters[String(i)]) return false;
  }
  return true;
}

async function main() {
  const existing = loadExistingDump();
  const dump = existing && existing.books
    ? existing
    : { fetchedAt: new Date().toISOString(), apiSource: API_SOURCE, books: {} };

  let fetched = 0;
  let skipped = 0;
  for (const [name, code, testament, expectedChapters] of BOOKS) {
    const bid = BOOKS.findIndex((b) => b[0] === name) + 1;
    const existingPayload = dump.books[name];
    if (existingPayload && isComplete(existingPayload, expectedChapters)) {
      console.log(`✓ ${name} (already complete; ${expectedChapters} chapters)`);
      skipped++;
      continue;
    }
    process.stdout.write(`→ ${name} (bid=${bid}, expected ${expectedChapters} chapters)… `);
    const t0 = Date.now();
    const payload = await fetchBook({ name, code, testament, bid, expectedChapters });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const got = Object.keys(payload.chapters).length;
    const gap = got !== expectedChapters ? ` (⚠ got ${got}/${expectedChapters})` : '';
    console.log(`done in ${elapsed}s, ${got} chapters${gap}`);
    dump.books[name] = payload;
    dump.fetchedAt = new Date().toISOString();
    saveDump(dump);    // checkpoint after every book
    fetched++;
  }

  console.log('');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  fetched: ${fetched}, skipped (already complete): ${skipped}`);
  const stat = fs.statSync(OUT_PATH);
  console.log(`  size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  // Final completeness report.
  let totalChapters = 0;
  let booksMissing = 0;
  for (const [name, , , expected] of BOOKS) {
    const p = dump.books[name];
    if (!p) { booksMissing++; continue; }
    const got = Object.keys(p.chapters).length;
    totalChapters += got;
    if (got !== expected) {
      console.log(`  ⚠ ${name}: ${got}/${expected} chapters`);
    }
  }
  console.log(`  total chapters in dump: ${totalChapters}`);
  if (booksMissing) console.log(`  ⚠ books missing entirely: ${booksMissing}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
